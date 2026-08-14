import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  API_ROUTES,
  ERROR_CODES,
  FREE_EPISODE_COUNT,
  HEARTBEAT_INTERVAL_SECONDS,
  OFFLINE_GRACE_SECONDS,
  PLAYBACK_TOKEN_TTL_SECONDS,
  PLAYBACK_WINDOW_SECONDS,
  PlaybackLeaseStatus,
  type ActivePlaybackLeaseResponse,
  type CreatePlaybackLeaseRequest,
  type PlaybackHeartbeatRequest,
  type PlaybackHeartbeatResponse,
  type PlaybackLeaseView,
  type RecoverPlaybackLeaseRequest
} from "@microfocus/contracts";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { Errors } from "../common/app-error.js";
import {
  allocateFefo,
  assertHeartbeatAnchor,
  heartbeatDebitSeconds,
  isLeaseFresh,
  nextMediaAnchor
} from "../domain/policies.js";
import { assertCircuitsClosed } from "../domain/circuit.js";
import { requireUser } from "../history/history.module.js";
import { assertRecentWechatReauth } from "../auth/reauth.js";
import { AppConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { VodProviderService, WechatProviderService } from "../providers/providers.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import {
  assertCanOpenPaidLease,
  confirmReservationWindow,
  createReservationWindow,
  markReservationsUnconfirmed,
  nextWindowIndex,
  recoverActionFor,
  recoverReservations,
  releaseOpenReservations,
  reservedSecondsForUser,
  toReservationView
} from "./playback-reservations.js";

class CreateLeaseDto implements CreatePlaybackLeaseRequest {
  @IsString()
  episodeId!: string;

  @IsString()
  deviceId!: string;
}

class HeartbeatDto implements PlaybackHeartbeatRequest {
  @IsInt()
  @Min(1)
  seq!: number;

  @IsNumber()
  @Min(0)
  mediaPositionSeconds!: number;

  @IsNumber()
  @Min(0)
  previousMediaPositionSeconds!: number;

  @IsNumber()
  @Min(0.75)
  @Max(2)
  playbackRate!: number;

  @IsIn(["playing", "paused", "buffering", "background"])
  state!: "playing" | "paused" | "buffering" | "background";

  @IsOptional()
  @IsString()
  windowId?: string;
}

class RecoverLeaseDto implements RecoverPlaybackLeaseRequest {
  @IsString()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @MaxLength(191)
  reason!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  wechatCode!: string;
}

@Controller("v1/playback/leases")
@UseGuards(JwtAuthGuard)
export class PlaybackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vod: VodProviderService,
    private readonly wechat: WechatProviderService,
    private readonly config: AppConfigService
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateLeaseDto
  ): Promise<PlaybackLeaseView> {
    const actor = playbackActor(principal);
    const episode = await this.prisma.episode.findUnique({
      where: { id: body.episodeId },
      include: {
        drama: { include: { rightsRecords: { where: { status: "ACTIVE" } } } },
        mediaAssets: { where: { isCurrent: true }, take: 1 }
      }
    });
    const now = new Date();
    await assertCircuitsClosed(this.prisma, {
      ...(actor.kind === "user" ? { userId: actor.userId } : {}),
      ...(episode?.dramaId ? { dramaId: episode.dramaId } : {})
    });
    const rights = episode?.drama.rightsRecords.find(
      (record) => record.validFrom <= now && record.validUntil > now
    );
    const asset = episode?.mediaAssets[0];
    if (!episode || episode.drama.status !== "PUBLISHED" || !rights) {
      throw Errors.notFound("Episode");
    }
    if (!isPlayableAsset(asset)) {
      throw Errors.conflict("MEDIA_NOT_READY", "Episode media is not approved and ready");
    }
    const isFree = episode.episodeNumber <= FREE_EPISODE_COUNT;
    if (actor.kind === "viewer" && !isFree) {
      throw Errors.forbidden(
        ERROR_CODES.USER_TOKEN_REQUIRED,
        "Locked episodes require a signed-in user"
      );
    }
    if (actor.kind === "viewer" && body.deviceId.trim() !== actor.deviceId) {
      throw Errors.forbidden("DEVICE_MISMATCH", "Anonymous lease device does not match the viewer session");
    }
    const remaining =
      isFree || actor.kind !== "user"
        ? null
        : Math.max(
            0,
            (await activeBalance(this.prisma, actor.userId, episode.dramaId, now)) -
              (await reservedSecondsForUser(this.prisma, actor.userId, episode.dramaId))
          );
    if (!isFree && actor.kind === "user") {
      await assertCanOpenPaidLease(this.prisma, {
        userId: actor.userId,
        deviceId: body.deviceId.slice(0, 128),
        dramaId: episode.dramaId,
        allocatableSeconds: remaining ?? 0
      });
    }
    if (!isFree && remaining === 0) {
      throw Errors.forbidden("ENTITLEMENT_REQUIRED", "No playback entitlement remains");
    }
    const lease = await this.prisma.$transaction(async (tx) => {
      if (actor.kind === "user") {
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.userId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM AnonymousViewerSession WHERE id = ${actor.viewerSessionId} FOR UPDATE`;
      }
      await tx.playbackReservation.updateMany({
        where: {
          status: "RESERVED",
          lease: { ...leaseOwnerWhere(actor), status: "ACTIVE" }
        },
        data: { status: "RELEASED" }
      });
      await tx.playbackLease.updateMany({
        where: { ...leaseOwnerWhere(actor), status: "ACTIVE" },
        data: { status: "REVOKED", activeKey: null, revokedAt: now }
      });
      const created = await tx.playbackLease.create({
        data: {
          ...(actor.kind === "user"
            ? { userId: actor.userId }
            : { viewerSessionId: actor.viewerSessionId }),
          episodeId: episode.id,
          deviceId: body.deviceId.slice(0, 128),
          activeKey: leaseActiveKey(actor),
          lastHeartbeatAt: now,
          tokenExpiresAt: new Date(now.getTime() + PLAYBACK_TOKEN_TTL_SECONDS * 1000)
        }
      });
      if (!isFree && actor.kind === "user") {
        await createReservationWindow(tx, created.id, 0, now);
      }
      return created;
    });
    const allocatable =
      remaining === null || isFree
        ? remaining
        : Math.max(0, remaining - PLAYBACK_WINDOW_SECONDS);
    return this.view(lease.id, episode.id, asset.fileId, isFree, allocatable);
  }

  @Get("active")
  async active(@CurrentPrincipal() principal: Principal): Promise<ActivePlaybackLeaseResponse> {
    const userId = requireUser(principal);
    const now = new Date();
    const activeLease = await this.prisma.playbackLease.findFirst({
      where: { userId, status: "ACTIVE" },
      include: {
        episode: { include: { mediaAssets: { where: { isCurrent: true }, take: 1 } } },
        reservations: { orderBy: { windowIndex: "asc" } }
      },
      orderBy: { updatedAt: "desc" }
    });
    const recoverable = activeLease
      ? null
      : await this.prisma.playbackLease.findFirst({
          where: {
            userId,
            reservations: { some: { status: "UNCONFIRMED" } }
          },
          include: {
            episode: { include: { mediaAssets: { where: { isCurrent: true }, take: 1 } } },
            reservations: { orderBy: { windowIndex: "asc" } }
          },
          orderBy: { updatedAt: "desc" }
        });
    const lease = activeLease ?? recoverable;
    if (!lease) {
      return { lease: null, reservations: [], unconfirmedCount: 0, recoverAction: "none" };
    }
    const unconfirmedCount = lease.reservations.filter((row) => row.status === "UNCONFIRMED").length;
    const graceUsed = await this.prisma.playbackRecoveryEvent.count({
      where: {
        userId,
        deviceId: lease.deviceId,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      }
    });
    const asset = lease.episode.mediaAssets[0];
    const isFree = lease.episode.episodeNumber <= FREE_EPISODE_COUNT;
    const remaining = isFree
      ? null
      : Math.max(
          0,
          (await activeBalance(this.prisma, userId, lease.episode.dramaId, now)) -
            (await reservedSecondsForUser(this.prisma, userId, lease.episode.dramaId))
        );
    const view = asset && isPlayableAsset(asset)
      ? await this.view(
          lease.id,
          lease.episodeId,
          asset.fileId,
          isFree,
          remaining,
          lease.status as PlaybackLeaseView["status"]
        )
      : {
          id: lease.id,
          episodeId: lease.episodeId,
          status: lease.status as PlaybackLeaseView["status"],
          playbackUrl: "",
          playbackTokenExpiresAt: lease.tokenExpiresAt.toISOString(),
          heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
          remainingSeconds: remaining,
          isFree,
          currentWindow: null
        };
    const current = lease.reservations.find((row) => row.status === "RESERVED") ?? null;
    return {
      lease: { ...view, currentWindow: current ? toReservationView(current) : null },
      reservations: lease.reservations.map(toReservationView),
      unconfirmedCount,
      recoverAction: recoverActionFor(unconfirmedCount, graceUsed)
    };
  }

  @Post(":leaseId/heartbeats")
  async heartbeat(
    @CurrentPrincipal() principal: Principal,
    @Param("leaseId") leaseId: string,
    @Body() body: HeartbeatDto
  ): Promise<PlaybackHeartbeatResponse> {
    const actor = playbackActor(principal);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM PlaybackLease WHERE id = ${leaseId} FOR UPDATE`;
      const lease = await tx.playbackLease.findFirst({
        where: { id: leaseId, ...leaseOwnerWhere(actor) },
        include: {
          episode: {
            include: {
              drama: { include: { rightsRecords: { where: { status: "ACTIVE" } } } },
              mediaAssets: { where: { isCurrent: true }, take: 1 }
            }
          }
        }
      });
      if (!lease) throw Errors.notFound("Playback lease");
      const existing = await tx.playbackHeartbeat.findUnique({
        where: { leaseId_seq: { leaseId, seq: body.seq } }
      });
      if (existing) return heartbeatView(existing);
      if (body.seq <= lease.lastSeq) {
        throw Errors.conflict("HEARTBEAT_OUT_OF_ORDER", "Heartbeat sequence is out of order");
      }
      const now = new Date();
      if (
        now.getTime() - lease.lastHeartbeatAt.getTime() >
        OFFLINE_GRACE_SECONDS * 1000
      ) {
        await tx.playbackLease.update({
          where: { id: lease.id },
          data: { status: "EXPIRED", activeKey: null, closedAt: now }
        });
        await markReservationsUnconfirmed(tx, leaseId);
        const response = {
          acknowledgedSeq: body.seq,
          debitedSeconds: 0,
          remainingSeconds: null,
          mayContinue: false,
          reason: "LEASE_REVOKED" as const
        };
        await tx.playbackHeartbeat.create({
          data: {
            leaseId,
            seq: body.seq,
            mediaPositionSeconds: lease.lastMediaPosition,
            debitedSeconds: 0,
            remainingSeconds: null,
            mayContinue: false,
            reason: response.reason
          }
        });
        return response;
      }
      try {
        assertHeartbeatAnchor(
          body.previousMediaPositionSeconds,
          Number(lease.lastMediaPosition)
        );
      } catch {
        throw Errors.conflict(
          "HEARTBEAT_ANCHOR_MISMATCH",
          "Heartbeat media position does not match the server anchor"
        );
      }
      await assertCircuitsClosed(tx, {
        ...(actor.kind === "user" ? { userId: actor.userId } : {}),
        dramaId: lease.episode.dramaId
      });
      const online =
        lease.episode.drama.status === "PUBLISHED" &&
        lease.episode.drama.rightsRecords.some(
          (record) => record.validFrom <= now && record.validUntil > now
        );
      const currentAsset = lease.episode.mediaAssets[0];
      const isFree = lease.episode.episodeNumber <= FREE_EPISODE_COUNT;
      let reason: PlaybackHeartbeatResponse["reason"];
      let mayContinue = true;
      let debitedSeconds = 0;
      let remainingSeconds: number | null = null;
      const requested = heartbeatDebitSeconds({
        state: body.state,
        mediaPositionSeconds: body.mediaPositionSeconds,
        lastMediaPositionSeconds: Number(lease.lastMediaPosition),
        serverElapsedSeconds: Math.max(0, (now.getTime() - lease.updatedAt.getTime()) / 1000),
        playbackRate: body.playbackRate,
        isFree
      });
      const nextAnchor = nextMediaAnchor({
        state: body.state,
        serverLastMediaPositionSeconds: Number(lease.lastMediaPosition),
        clientMediaPositionSeconds: body.mediaPositionSeconds
      });

      if (lease.status !== "ACTIVE") {
        mayContinue = false;
        reason = "LEASE_REVOKED";
      } else if (!online) {
        mayContinue = false;
        reason = "DRAMA_OFFLINE";
      } else if (!isPlayableAsset(currentAsset)) {
        mayContinue = false;
        reason = "DRAMA_OFFLINE";
      } else if (!isFree) {
        if (actor.kind !== "user") {
          throw Errors.forbidden(
            ERROR_CODES.USER_TOKEN_REQUIRED,
            "Locked episodes require a signed-in user"
          );
        }
        await tx.$queryRaw`SELECT id FROM EntitlementGrant WHERE userId = ${actor.userId} AND dramaId = ${lease.episode.dramaId} AND expiresAt > ${now} AND remainingSeconds > 0 ORDER BY expiresAt ASC FOR UPDATE`;
        const grants = await tx.entitlementGrant.findMany({
          where: {
            userId: actor.userId,
            dramaId: lease.episode.dramaId,
            expiresAt: { gt: now },
            remainingSeconds: { gt: 0 }
          },
          orderBy: { expiresAt: "asc" }
        });
        const allocation = allocateFefo(grants, requested, now);
        remainingSeconds = allocation.remainingSeconds;
        debitedSeconds = allocation.debitedSeconds;
        const heartbeat = await tx.playbackHeartbeat.create({
          data: {
            leaseId,
            seq: body.seq,
            mediaPositionSeconds: body.mediaPositionSeconds,
            debitedSeconds,
            remainingSeconds,
            mayContinue: requested === debitedSeconds,
            reason: requested === debitedSeconds ? null : "ENTITLEMENT_EXHAUSTED"
          }
        });
        for (const debit of allocation.debits) {
          const updated = await tx.entitlementGrant.updateMany({
            where: { id: debit.id, remainingSeconds: { gte: debit.seconds } },
            data: { remainingSeconds: { decrement: debit.seconds } }
          });
          if (updated.count !== 1) {
            throw Errors.conflict("ENTITLEMENT_CONFLICT", "Entitlement changed concurrently");
          }
          await tx.entitlementDebit.create({
            data: {
              grantId: debit.id,
              leaseId,
              heartbeatId: heartbeat.id,
              heartbeatSeq: body.seq,
              seconds: debit.seconds
            }
          });
        }
        if (body.state === "playing" && debitedSeconds > 0) {
          await confirmReservationWindow(tx, {
            leaseId,
            ...(body.windowId ? { windowId: body.windowId } : {}),
            heartbeatId: heartbeat.id
          });
          if (requested === debitedSeconds) {
            const reserved = await reservedSecondsForUser(tx, actor.userId, lease.episode.dramaId);
            const balance = await activeBalance(tx, actor.userId, lease.episode.dramaId, now);
            if (balance - reserved >= PLAYBACK_WINDOW_SECONDS) {
              await createReservationWindow(tx, leaseId, await nextWindowIndex(tx, leaseId), now);
            }
          }
        } else if (body.state !== "playing") {
          await releaseOpenReservations(tx, leaseId);
        }
        const reserved = await reservedSecondsForUser(tx, actor.userId, lease.episode.dramaId);
        remainingSeconds = Math.max(0, (remainingSeconds ?? 0) - reserved);
        await tx.playbackHeartbeat.update({
          where: { id: heartbeat.id },
          data: { remainingSeconds }
        });
        if (requested > debitedSeconds) {
          mayContinue = false;
          reason = "ENTITLEMENT_EXHAUSTED";
        }
        await tx.playbackLease.update({
          where: { id: lease.id },
          data: {
            lastSeq: body.seq,
            lastMediaPosition: nextAnchor,
            lastHeartbeatAt: now,
            ...(mayContinue
              ? {}
              : { status: "CLOSED", activeKey: null, closedAt: now })
          }
        });
        return {
          acknowledgedSeq: body.seq,
          debitedSeconds,
          remainingSeconds,
          mayContinue,
          ...(reason ? { reason } : {})
        };
      }

      await tx.playbackLease.update({
        where: { id: lease.id },
        data: {
          lastSeq: body.seq,
          lastMediaPosition: nextAnchor,
          lastHeartbeatAt: now,
          ...(mayContinue ? {} : { status: "CLOSED", activeKey: null, closedAt: now })
        }
      });
      await tx.playbackHeartbeat.create({
        data: {
          leaseId,
          seq: body.seq,
          mediaPositionSeconds: body.mediaPositionSeconds,
          debitedSeconds,
          remainingSeconds,
          mayContinue,
          reason: reason ?? null
        }
      });
      return {
        acknowledgedSeq: body.seq,
        debitedSeconds,
        remainingSeconds,
        mayContinue,
        ...(reason ? { reason } : {})
      };
    });
  }

  @Post(":leaseId/renew")
  async renew(
    @CurrentPrincipal() principal: Principal,
    @Param("leaseId") leaseId: string
  ): Promise<PlaybackLeaseView> {
    const actor = playbackActor(principal);
    const lease = await this.prisma.playbackLease.findFirst({
      where: { id: leaseId, ...leaseOwnerWhere(actor), status: "ACTIVE" },
      include: {
        episode: {
          include: {
            drama: { include: { rightsRecords: { where: { status: "ACTIVE" } } } },
            mediaAssets: { where: { isCurrent: true }, take: 1 }
          }
        }
      }
    });
    if (!lease) throw Errors.notFound("Active playback lease");
    const now = new Date();
    await assertCircuitsClosed(this.prisma, {
      ...(actor.kind === "user" ? { userId: actor.userId } : {}),
      dramaId: lease.episode.dramaId
    });
    if (
      lease.episode.drama.status !== "PUBLISHED" ||
      !lease.episode.drama.rightsRecords.some(
        (record) => record.validFrom <= now && record.validUntil > now
      )
    ) {
      throw Errors.conflict("DRAMA_OFFLINE", "Offline content cannot be renewed");
    }
    if (
      !isLeaseFresh({
        lastSeq: lease.lastSeq,
        lastHeartbeatAt: lease.lastHeartbeatAt,
        now,
        graceSeconds: OFFLINE_GRACE_SECONDS
      })
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.playbackLease.updateMany({
          where: { id: lease.id, status: "ACTIVE" },
          data: { status: "EXPIRED", activeKey: null, closedAt: now }
        });
        await markReservationsUnconfirmed(tx, lease.id);
      });
      throw Errors.conflict(
        "LEASE_STALE",
        "Playback lease must have a recent compliant heartbeat before renewal"
      );
    }
    const asset = lease.episode.mediaAssets[0];
    if (!isPlayableAsset(asset)) {
      throw Errors.conflict("MEDIA_NOT_READY", "Episode media is not approved and ready");
    }
    const isFree = lease.episode.episodeNumber <= FREE_EPISODE_COUNT;
    const grantBalance =
      isFree || actor.kind !== "user"
        ? 0
        : await activeBalance(this.prisma, actor.userId, lease.episode.dramaId, now);
    const remaining = isFree
      ? null
      : actor.kind === "user"
        ? Math.max(
            0,
            grantBalance - (await reservedSecondsForUser(this.prisma, actor.userId, lease.episode.dramaId))
          )
        : 0;
    if (!isFree && grantBalance === 0) {
      await this.prisma.playbackLease.updateMany({
        where: { id: lease.id, status: "ACTIVE" },
        data: { status: "CLOSED", activeKey: null, closedAt: now }
      });
      throw Errors.forbidden(
        "ENTITLEMENT_REQUIRED",
        "No playback entitlement remains"
      );
    }
    const renewed = await this.view(lease.id, lease.episodeId, asset.fileId, isFree, remaining);
    await this.prisma.playbackLease.update({
      where: { id: lease.id },
      data: { tokenExpiresAt: new Date(renewed.playbackTokenExpiresAt) }
    });
    return renewed;
  }

  @Post(":leaseId/recover")
  async recover(
    @CurrentPrincipal() principal: Principal,
    @Param("leaseId") leaseId: string,
    @Body() body: RecoverLeaseDto
  ): Promise<ActivePlaybackLeaseResponse> {
    const userId = requireUser(principal);
    const lease = await this.prisma.playbackLease.findFirst({
      where: { id: leaseId, userId }
    });
    if (!lease) throw Errors.notFound("Playback lease");
    await assertRecentWechatReauth({
      prisma: this.prisma,
      wechat: this.wechat,
      wechatMode: this.config.env.WECHAT_MODE,
      userId,
      wechatCode: body.wechatCode
    });
    await this.prisma.$transaction(async (tx) => {
      await recoverReservations(tx, {
        userId,
        deviceId: body.deviceId,
        leaseId,
        reason: body.reason,
        now: new Date()
      });
    });
    return this.active(principal);
  }

  @Delete(":leaseId")
  async close(@CurrentPrincipal() principal: Principal, @Param("leaseId") leaseId: string) {
    const actor = playbackActor(principal);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.playbackLease.updateMany({
        where: { id: leaseId, ...leaseOwnerWhere(actor), status: "ACTIVE" },
        data: { status: "CLOSED", activeKey: null, closedAt: new Date() }
      });
      if (result.count) await releaseOpenReservations(tx, leaseId);
      return result;
    });
    if (!updated.count) throw Errors.notFound("Active playback lease");
    return { closed: true };
  }

  private async view(
    leaseId: string,
    episodeId: string,
    fileId: string,
    isFree: boolean,
    remainingSeconds: number | null,
    status: PlaybackLeaseView["status"] = PlaybackLeaseStatus.ACTIVE
  ): Promise<PlaybackLeaseView> {
    const expiresAt = new Date(Date.now() + PLAYBACK_TOKEN_TTL_SECONDS * 1000);
    const current = await this.prisma.playbackReservation.findFirst({
      where: { leaseId, status: "RESERVED" },
      orderBy: { windowIndex: "desc" }
    });
    return {
      id: leaseId,
      episodeId,
      status,
      playbackUrl: fileId ? await this.vod.createPlaybackUrl(fileId, PLAYBACK_TOKEN_TTL_SECONDS) : "",
      playbackTokenExpiresAt: expiresAt.toISOString(),
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      remainingSeconds,
      isFree,
      currentWindow: current ? toReservationView(current) : null
    };
  }
}

async function activeBalance(
  prisma: { entitlementGrant: PrismaService["entitlementGrant"] },
  userId: string,
  dramaId: string,
  now: Date
): Promise<number> {
  const balance = await prisma.entitlementGrant.aggregate({
    where: { userId, dramaId, expiresAt: { gt: now }, remainingSeconds: { gt: 0 } },
    _sum: { remainingSeconds: true }
  });
  return Math.max(0, balance._sum.remainingSeconds ?? 0);
}

function heartbeatView(row: {
  seq: number;
  debitedSeconds: number;
  remainingSeconds: number | null;
  mayContinue: boolean;
  reason: string | null;
}): PlaybackHeartbeatResponse {
  const reason = row.reason as PlaybackHeartbeatResponse["reason"] | undefined;
  return {
    acknowledgedSeq: row.seq,
    debitedSeconds: row.debitedSeconds,
    remainingSeconds: row.remainingSeconds,
    mayContinue: row.mayContinue,
    ...(reason ? { reason } : {})
  };
}

function isPlayableAsset(asset: {
  fileId: string;
  mediaStatus: string;
  transcodeStatus: string;
  machineReviewStatus: string;
  manualReviewStatus: string;
  wechatReviewStatus: string;
} | undefined): asset is NonNullable<typeof asset> {
  if (!asset) return false;
  return (
    asset.mediaStatus === "READY" &&
    asset.transcodeStatus === "READY" &&
    asset.machineReviewStatus === "APPROVED" &&
    asset.manualReviewStatus === "APPROVED" &&
    asset.wechatReviewStatus === "APPROVED"
  );
}

type PlaybackActor =
  | { kind: "user"; userId: string }
  | { kind: "viewer"; viewerSessionId: string; deviceId: string };

function playbackActor(principal: Principal): PlaybackActor {
  if (principal.kind === "user") return { kind: "user", userId: principal.sub };
  if (principal.kind === "viewer") {
    return { kind: "viewer", viewerSessionId: principal.sub, deviceId: principal.deviceId };
  }
  throw Errors.forbidden(ERROR_CODES.USER_TOKEN_REQUIRED, "A viewer or user token is required");
}

function leaseOwnerWhere(actor: PlaybackActor): { userId: string } | { viewerSessionId: string } {
  return actor.kind === "user"
    ? { userId: actor.userId }
    : { viewerSessionId: actor.viewerSessionId };
}

function leaseActiveKey(actor: PlaybackActor): string {
  return actor.kind === "user" ? actor.userId : `viewer:${actor.viewerSessionId}`;
}

@Module({ controllers: [PlaybackController] })
export class PlaybackModule {}
