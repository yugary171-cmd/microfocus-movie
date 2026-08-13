import {
  Body,
  Controller,
  Delete,
  Module,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  FREE_EPISODE_COUNT,
  HEARTBEAT_INTERVAL_SECONDS,
  OFFLINE_GRACE_SECONDS,
  PLAYBACK_TOKEN_TTL_SECONDS,
  PlaybackLeaseStatus,
  type CreatePlaybackLeaseRequest,
  type PlaybackHeartbeatRequest,
  type PlaybackHeartbeatResponse,
  type PlaybackLeaseView
} from "@microfocus/contracts";
import { IsIn, IsInt, IsNumber, IsString, Max, Min } from "class-validator";
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
import { PrismaService } from "../prisma/prisma.service.js";
import { VodProviderService } from "../providers/providers.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";

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
}

@Controller("v1/playback/leases")
@UseGuards(JwtAuthGuard)
export class PlaybackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vod: VodProviderService
  ) {}

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateLeaseDto
  ): Promise<PlaybackLeaseView> {
    const userId = requireUser(principal);
    const episode = await this.prisma.episode.findUnique({
      where: { id: body.episodeId },
      include: {
        drama: { include: { rightsRecords: { where: { status: "ACTIVE" } } } },
        mediaAssets: { where: { isCurrent: true }, take: 1 }
      }
    });
    const now = new Date();
    await assertCircuitsClosed(this.prisma, {
      userId,
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
    const remaining = isFree ? null : await activeBalance(this.prisma, userId, episode.dramaId, now);
    if (!isFree && remaining === 0) {
      throw Errors.forbidden("ENTITLEMENT_REQUIRED", "No playback entitlement remains");
    }
    const lease = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      await tx.playbackLease.updateMany({
        where: { userId, status: "ACTIVE" },
        data: { status: "REVOKED", activeKey: null, revokedAt: now }
      });
      return tx.playbackLease.create({
        data: {
          userId,
          episodeId: episode.id,
          deviceId: body.deviceId.slice(0, 128),
          activeKey: userId,
          lastHeartbeatAt: now,
          tokenExpiresAt: new Date(now.getTime() + PLAYBACK_TOKEN_TTL_SECONDS * 1000)
        }
      });
    });
    return this.view(lease.id, episode.id, asset.fileId, isFree, remaining);
  }

  @Post(":leaseId/heartbeats")
  async heartbeat(
    @CurrentPrincipal() principal: Principal,
    @Param("leaseId") leaseId: string,
    @Body() body: HeartbeatDto
  ): Promise<PlaybackHeartbeatResponse> {
    const userId = requireUser(principal);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM PlaybackLease WHERE id = ${leaseId} FOR UPDATE`;
      const lease = await tx.playbackLease.findFirst({
        where: { id: leaseId, userId },
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
        userId,
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
        await tx.$queryRaw`SELECT id FROM EntitlementGrant WHERE userId = ${userId} AND dramaId = ${lease.episode.dramaId} AND expiresAt > ${now} AND remainingSeconds > 0 ORDER BY expiresAt ASC FOR UPDATE`;
        const grants = await tx.entitlementGrant.findMany({
          where: {
            userId,
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
    const userId = requireUser(principal);
    const lease = await this.prisma.playbackLease.findFirst({
      where: { id: leaseId, userId, status: "ACTIVE" },
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
      userId,
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
      await this.prisma.playbackLease.updateMany({
        where: { id: lease.id, status: "ACTIVE" },
        data: { status: "EXPIRED", activeKey: null, closedAt: now }
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
    const remaining = isFree
      ? null
      : await activeBalance(this.prisma, userId, lease.episode.dramaId, now);
    if (!isFree && remaining === 0) {
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

  @Delete(":leaseId")
  async close(@CurrentPrincipal() principal: Principal, @Param("leaseId") leaseId: string) {
    const userId = requireUser(principal);
    const updated = await this.prisma.playbackLease.updateMany({
      where: { id: leaseId, userId, status: "ACTIVE" },
      data: { status: "CLOSED", activeKey: null, closedAt: new Date() }
    });
    if (!updated.count) throw Errors.notFound("Active playback lease");
    return { closed: true };
  }

  private async view(
    leaseId: string,
    episodeId: string,
    fileId: string,
    isFree: boolean,
    remainingSeconds: number | null
  ): Promise<PlaybackLeaseView> {
    const expiresAt = new Date(Date.now() + PLAYBACK_TOKEN_TTL_SECONDS * 1000);
    return {
      id: leaseId,
      episodeId,
      status: PlaybackLeaseStatus.ACTIVE,
      playbackUrl: await this.vod.createPlaybackUrl(fileId, PLAYBACK_TOKEN_TTL_SECONDS),
      playbackTokenExpiresAt: expiresAt.toISOString(),
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      remainingSeconds,
      isFree
    };
  }
}

async function activeBalance(
  prisma: PrismaService,
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

@Module({ controllers: [PlaybackController] })
export class PlaybackModule {}
