import {
  Body,
  Controller,
  Get,
  Headers,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  API_ROUTES,
  AdminRole,
  CallbackEventStatus,
  EntitlementAdjustmentType,
  EntitlementFactType,
  type CreateEntitlementAdjustmentRequest,
  type ReplayCallbackEventRequest,
  type ReissueDeletionQueryTokenRequest,
  type ReleaseGateStatus
} from "@microfocus/contracts";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  Max,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { controllerPath, currentRequestId } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
import { publicationBlockers, releaseGateStatus } from "../domain/policies.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  LIVE_PROVIDER_IMPLEMENTATIONS_READY,
  VodProviderService,
  WechatProviderService
} from "../providers/providers.js";
import {
  AdminRolesGuard,
  CurrentPrincipal,
  JwtAuthGuard,
  Roles,
  type Principal
} from "../security/security.js";
import { AdminWriteRateLimitGuard } from "../security/admin-write-rate-limit.js";
import {
  assertEditorOwns,
  assertNotPublished,
  assertNotSelfReview,
  editorScope,
  type AdminPrincipal
} from "./admin.access.js";
import {
  createIdempotentCompensation,
  normalizeIdempotencyKey
} from "./admin.compensate.js";
import { createIdempotentAdjustment } from "./admin.adjust.js";
import { replayCallbackEvent } from "../callbacks/callback-replay.js";
import { listAdminCallbackEvents } from "../callbacks/callback-list.js";
import { resolvePayloadEncryptionKey, withEncryptionKey } from "../callbacks/callback-payload.js";
import { lookupAdminDeletionRequest, reissueDeletionQueryToken as issueDeletionQueryToken } from "../privacy/deletion.js";
import { tryOfflinePublishedDrama } from "../catalog/offline-drama.js";

class EpisodeInput {
  @IsInt()
  @Min(1)
  episodeNumber!: number;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsInt()
  @Min(1)
  durationSeconds!: number;
}

class CreateDramaDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() summary!: string;
  @IsUrl() coverUrl!: string;
  @IsString() category!: string;
  @IsArray() @IsString({ each: true }) tags!: string[];
  @IsInt() @Min(0) recommendationRank!: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EpisodeInput)
  episodes!: EpisodeInput[];
}

class UpdateDramaDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsUrl() coverUrl?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(0) recommendationRank?: number;
}

class RightsDto {
  @IsString() rightsHolder!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
  @IsIn(["CN"]) territory!: string;
  @IsBoolean() allowsWechatDistribution!: boolean;
  @IsBoolean() allowsAdMonetization!: boolean;
  @IsBoolean() allowsTranscoding!: boolean;
  @IsBoolean() allowsPromotionalMaterial!: boolean;
  @IsString() licenseNumber!: string;
  @IsString() reportNumber!: string;
  @IsString() materialObjectKey!: string;
  @Matches(/^[a-f0-9]{64}$/i) materialDigestSha256!: string;
}

class MediaAssetDto {
  @IsString() episodeId!: string;
  @IsString() fileId!: string;
}

class ReviewDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class MediaReviewDto {
  @IsOptional()
  @IsIn(["APPROVED", "REJECTED"])
  manualReviewStatus?: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsIn(["APPROVED", "REJECTED"])
  wechatReviewStatus?: "APPROVED" | "REJECTED";

  @IsString() @Length(6, 500) notes!: string;
}

class UploadSignDto {
  @IsString() @MinLength(1) dramaId!: string;
  @IsString() @MinLength(1) episodeId!: string;
  @IsString() @Length(1, 255) @Matches(/^[^/\\\0]+$/) fileName!: string;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024 * 1024) size!: number;
  @IsIn(["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"])
  contentType!: string;
}

class OfflineDto {
  @IsString() @Length(6, 500) reason!: string;
}

class CompensateDto {
  @IsString() userId!: string;
  @IsString() dramaId!: string;
  @IsInt() @Min(1) seconds!: number;
  @IsDateString() expiresAt!: string;
  @IsString() @Length(1, 500) reason!: string;
}

class AdjustEntitlementDto implements CreateEntitlementAdjustmentRequest {
  @IsIn(Object.values(EntitlementAdjustmentType))
  type!: EntitlementAdjustmentType;

  @IsString()
  grantId!: string;

  @IsInt()
  @Min(1)
  @Max(86_400)
  seconds!: number;

  @IsString()
  @Length(6, 300)
  reason!: string;

  @IsOptional()
  @IsIn(Object.values(EntitlementFactType))
  sourceFactType?: EntitlementFactType;

  @IsOptional()
  @IsString()
  sourceFactId?: string;

  @IsOptional()
  @IsString()
  freezeAdjustmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  approvalNote?: string;
}

class ReplayCallbackDto implements ReplayCallbackEventRequest {
  @IsString()
  @Length(6, 300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  approvalNote?: string;
}

class ReissueDeletionQueryTokenDto implements ReissueDeletionQueryTokenRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  userId!: string;

  @IsString()
  @Length(6, 300)
  reason!: string;

  @IsString()
  @Length(6, 300)
  approvalNote!: string;
}

class CircuitDto {
  @IsIn(["CLOSED", "OPEN"])
  state!: "CLOSED" | "OPEN";

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class CircuitCollectionDto {
  @IsOptional()
  @IsIn(["GLOBAL", "USER", "DRAMA", "AD_UNIT", "PROVIDER"])
  scope?: "GLOBAL" | "USER" | "DRAMA" | "AD_UNIT" | "PROVIDER";

  @IsOptional() @IsString() @MaxLength(200) targetId?: string;
  @IsBoolean() enabled!: boolean;
  @IsString() @Length(1, 500) reason!: string;
}

@Controller("v1/admin")
@UseGuards(JwtAuthGuard, AdminRolesGuard, AdminWriteRateLimitGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly vod: VodProviderService,
    private readonly wechat: WechatProviderService
  ) {}

  @Get("dashboard")
  async dashboard(@CurrentPrincipal() principal: Principal) {
    const admin = requireAdmin(principal);
    const scope = editorScope(admin);
    const [
      statusGroups,
      pendingReviews,
      deadLetterCount,
      retryableCount,
      oldestUnprocessed,
      openProviderCircuits,
      ledgerEvent,
      ledgerCircuit
    ] =
      await Promise.all([
      this.prisma.drama.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true }
      }),
      this.prisma.drama.count({ where: { ...scope, status: "PENDING_REVIEW" } }),
      this.prisma.callbackEvent.count({ where: { status: CallbackEventStatus.DEAD_LETTER } }),
      this.prisma.callbackEvent.count({
        where: { status: CallbackEventStatus.RETRYABLE_FAILURE }
      }),
      this.prisma.callbackEvent.findFirst({
        where: {
          status: {
            in: [
              CallbackEventStatus.RECEIVED,
              CallbackEventStatus.PROCESSING,
              CallbackEventStatus.RETRYABLE_FAILURE
            ]
          }
        },
        orderBy: { receivedAt: "asc" },
        select: { receivedAt: true }
      }),
      this.prisma.circuitBreaker.findMany({
        where: { provider: { startsWith: "PROVIDER:" }, state: "OPEN" },
        select: { provider: true }
      }),
      this.prisma.operationalEvent.findFirst({
        where: { eventType: "LEDGER_RECONCILED" },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true, value: true, metadataJson: true }
      }),
      this.prisma.circuitBreaker.findUnique({
        where: { provider: "PROVIDER:LEDGER" },
        select: { state: true }
      })
    ]);
    const statusCounts = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all])
    );
    const oldestUnprocessedAgeSeconds = oldestUnprocessed
      ? Math.max(0, Math.floor((Date.now() - oldestUnprocessed.receivedAt.getTime()) / 1000))
      : null;
    const ledgerMeta = ledgerEvent?.metadataJson;
    const ledgerRecord =
      ledgerMeta && typeof ledgerMeta === "object" && !Array.isArray(ledgerMeta)
        ? (ledgerMeta as Record<string, unknown>)
        : {};
    return {
      releaseGate: this.releaseGate(),
      statusCounts,
      reviewBacklog: pendingReviews,
      metricSourceConfigured: false,
      callbackOps: {
        deadLetterCount,
        retryableCount,
        oldestUnprocessedAgeSeconds,
        openProviderCircuits: openProviderCircuits.map((row) => row.provider)
      },
      ledgerOps: {
        mismatchCount: Math.max(0, ledgerEvent?.value ?? 0),
        mismatchedSeconds:
          typeof ledgerRecord.mismatchedSeconds === "number"
            ? Math.max(0, Math.round(ledgerRecord.mismatchedSeconds))
            : 0,
        missingGrants:
          typeof ledgerRecord.missingGrants === "number"
            ? Math.max(0, Math.round(ledgerRecord.missingGrants))
            : 0,
        lastReconciledAt: ledgerEvent?.occurredAt.toISOString() ?? null,
        ledgerCircuitOpen: ledgerCircuit?.state === "OPEN"
      }
    };
  }

  @Get("dramas")
  async dramas(
    @CurrentPrincipal() principal: Principal,
    @Query("status") status?: string
  ) {
    const admin = requireAdmin(principal);
    const allowed = ["DRAFT", "PENDING_REVIEW", "READY", "PUBLISHED", "OFFLINE"];
    const items = await this.prisma.drama.findMany({
      where: {
        ...editorScope(admin),
        ...(status && allowed.includes(status) ? { status: status as never } : {})
      },
      include: {
        editor: { select: { email: true } },
        rightsRecords: { orderBy: { version: "desc" }, take: 1 },
        reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" } },
        episodes: { include: { mediaAssets: { where: { isCurrent: true }, take: 1 } } }
      },
      orderBy: { updatedAt: "desc" }
    });
    return { items: items.map(toAdminDrama), total: items.length };
  }

  @Post("dramas")
  @Roles(AdminRole.EDITOR)
  async createDrama(@CurrentPrincipal() principal: Principal, @Body() body: CreateDramaDto) {
    const admin = requireAdmin(principal);
    assertUniqueEpisodeNumbers(body.episodes);
    const drama = await this.prisma.drama.create({
      data: {
        title: body.title,
        summary: body.summary,
        coverUrl: body.coverUrl,
        category: body.category,
        tagsJson: body.tags,
        recommendationRank: body.recommendationRank,
        editorId: admin.sub,
        episodes: { create: body.episodes }
      }
    });
    await this.audit(admin.sub, "DRAMA_CREATED", "Drama", drama.id);
    return this.loadDramaView(drama.id, admin);
  }

  @Get("dramas/:dramaId")
  async drama(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string
  ) {
    return this.loadDramaView(dramaId, requireAdmin(principal));
  }

  @Patch("dramas/:dramaId")
  @Roles(AdminRole.EDITOR)
  async updateDrama(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string,
    @Body() body: UpdateDramaDto
  ) {
    const admin = requireAdmin(principal);
    await this.requireOwnedUnpublishedDrama(dramaId, admin);
    const updated = await this.prisma.drama.updateMany({
      where: {
        id: dramaId,
        editorId: admin.sub,
        status: { in: ["DRAFT", "READY", "OFFLINE"] }
      },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.tags !== undefined ? { tagsJson: body.tags } : {}),
        ...(body.recommendationRank !== undefined
          ? { recommendationRank: body.recommendationRank }
          : {}),
        contentVersion: { increment: 1 },
        status: "DRAFT"
      }
    });
    if (!updated.count) throw Errors.conflict("DRAMA_NOT_EDITABLE", "Drama is not editable");
    await this.audit(admin.sub, "DRAMA_UPDATED", "Drama", dramaId);
    return this.loadDramaView(dramaId, admin);
  }

  @Post("dramas/:dramaId/rights")
  @Roles(AdminRole.EDITOR)
  async addRights(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string,
    @Body() body: RightsDto
  ) {
    const admin = requireAdmin(principal);
    await this.requireOwnedUnpublishedDrama(dramaId, admin);
    const latest = await this.prisma.rightsRecord.aggregate({
      where: { dramaId },
      _max: { version: true }
    });
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rightsRecord.create({
        data: {
          dramaId,
          version: (latest._max.version ?? 0) + 1,
          status: "ACTIVE",
          ...body,
          validFrom: new Date(body.validFrom),
          validUntil: new Date(body.validUntil)
        }
      });
      await tx.rightsRecord.updateMany({
        where: { dramaId, id: { not: created.id }, status: "ACTIVE" },
        data: { status: "REVOKED" }
      });
      await tx.drama.update({
        where: { id: dramaId },
        data: { contentVersion: { increment: 1 }, status: "DRAFT" }
      });
      return created;
    });
    await this.audit(admin.sub, "RIGHTS_VERSION_CREATED", "RightsRecord", record.id);
    return record;
  }

  @Post("dramas/:dramaId/media-assets")
  @Roles(AdminRole.EDITOR)
  async addMedia(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string,
    @Body() body: MediaAssetDto
  ) {
    const admin = requireAdmin(principal);
    await this.requireOwnedUnpublishedDrama(dramaId, admin);
    const episode = await this.prisma.episode.findFirst({
      where: { id: body.episodeId, dramaId }
    });
    if (!episode) throw Errors.notFound("Episode");
    const latest = await this.prisma.mediaAsset.aggregate({
      where: { episodeId: body.episodeId },
      _max: { version: true }
    });
    const asset = await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({
        where: { episodeId: body.episodeId, isCurrent: true },
        data: { isCurrent: false }
      });
      return tx.mediaAsset.create({
        data: {
          episodeId: body.episodeId,
          fileId: body.fileId,
          version: (latest._max.version ?? 0) + 1,
          isCurrent: true,
          mediaStatus: "PROCESSING",
          transcodeStatus: "PROCESSING"
        }
      }).then(async (created) => {
        await tx.drama.update({
          where: { id: dramaId },
          data: { contentVersion: { increment: 1 }, status: "DRAFT" }
        });
        return created;
      });
    });
    await this.audit(admin.sub, "MEDIA_VERSION_CREATED", "MediaAsset", asset.id);
    return asset;
  }

  @Post("dramas/:dramaId/submit-review")
  @Roles(AdminRole.EDITOR)
  async submitReview(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string
  ) {
    const admin = requireAdmin(principal);
    await this.requireOwnedDrama(dramaId, admin);
    const updated = await this.prisma.drama.updateMany({
      where: { id: dramaId, editorId: admin.sub, status: { in: ["DRAFT", "READY"] } },
      data: { status: "PENDING_REVIEW" }
    });
    if (!updated.count) throw Errors.conflict("INVALID_DRAMA_STATE", "Drama cannot be submitted");
    await this.audit(admin.sub, "DRAMA_SUBMITTED", "Drama", dramaId);
    return { status: "PENDING_REVIEW" };
  }

  @Post("dramas/:dramaId/review")
  @Roles(AdminRole.REVIEWER)
  async review(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string,
    @Body() body: ReviewDto
  ) {
    const admin = requireAdmin(principal);
    const drama = await this.prisma.drama.findUnique({ where: { id: dramaId } });
    if (!drama) throw Errors.notFound("Drama");
    if (drama.status !== "PENDING_REVIEW") {
      throw Errors.conflict("INVALID_DRAMA_STATE", "Only pending dramas can be reviewed");
    }
    assertNotSelfReview(drama.editorId, admin.sub);
    const review = await this.prisma.dramaReview.create({
      data: {
        dramaId,
        reviewerId: admin.sub,
        contentVersion: drama.contentVersion,
        status: body.status,
        ...(body.notes !== undefined ? { notes: body.notes } : {})
      }
    });
    await this.prisma.drama.update({
      where: { id: dramaId },
      data: { status: body.status === "APPROVED" ? "READY" : "DRAFT" }
    });
    await this.audit(admin.sub, `DRAMA_${body.status}`, "Drama", dramaId);
    return review;
  }

  @Post("dramas/:dramaId/publish")
  @Roles(AdminRole.ADMIN)
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string
  ) {
    const admin = requireAdmin(principal);
    const gate = this.releaseGate();
    if (!gate.readyForExternalTraffic) {
      throw Errors.conflict("RELEASE_GATE_FAILED", gate.blockers.join(","));
    }
    const drama = await this.prisma.drama.findUnique({
      where: { id: dramaId },
      include: {
        rightsRecords: {
          where: { status: "ACTIVE" },
          orderBy: { version: "desc" },
          take: 1
        },
        reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" } },
        episodes: { include: { mediaAssets: { where: { isCurrent: true }, take: 1 } } }
      }
    });
    if (!drama) throw Errors.notFound("Drama");
    if (drama.status !== "READY") {
      throw Errors.conflict("INVALID_DRAMA_STATE", "Only ready dramas can be published");
    }
    const currentReview = drama.reviews.find(
      (review) => review.contentVersion === drama.contentVersion
    );
    const blockers = publicationBlockers({
      editorId: drama.editorId,
      ...(currentReview ? { reviewerId: currentReview.reviewerId } : {}),
      now: new Date(),
      ...(drama.rightsRecords[0] ? { rights: drama.rightsRecords[0] } : {}),
      episodes: drama.episodes.map((episode) =>
        episode.mediaAssets[0] ? { currentAsset: episode.mediaAssets[0] } : {}
      )
    });
    if (blockers.length) {
      throw Errors.conflict("PUBLICATION_GATE_FAILED", blockers.join(","));
    }
    await this.prisma.drama.update({
      where: { id: dramaId },
      data: { status: "PUBLISHED", publishedAt: new Date() }
    });
    await this.audit(admin.sub, "DRAMA_PUBLISHED", "Drama", dramaId);
    return { status: "PUBLISHED" };
  }

  @Post("dramas/:dramaId/offline")
  @Roles(AdminRole.ADMIN)
  async offline(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaId: string,
    @Body() body: OfflineDto
  ) {
    const admin = requireAdmin(principal);
    const offlined = await this.prisma.$transaction(async (tx) =>
      tryOfflinePublishedDrama(tx as never, dramaId)
    );
    if (!offlined) throw Errors.conflict("INVALID_DRAMA_STATE", "Drama is not published");
    await this.audit(admin.sub, "DRAMA_OFFLINED", "Drama", dramaId, {
      reason: body.reason
    });
    return { status: "OFFLINE" };
  }

  @Post("uploads/sign")
  @Roles(AdminRole.EDITOR)
  async uploadSign(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UploadSignDto
  ) {
    const admin = requireAdmin(principal);
    const episode = await this.prisma.episode.findFirst({
      where: { id: body.episodeId, dramaId: body.dramaId },
      include: { drama: { select: { status: true, editorId: true } } }
    });
    if (!episode) throw Errors.notFound("Episode");
    assertEditorOwns(episode.drama, admin);
    assertNotPublished(episode.drama.status);
    return this.vod.createUploadAuthorization(body.fileName);
  }

  @Patch("media-assets/:assetId/review")
  @Roles(AdminRole.REVIEWER)
  async reviewMedia(
    @CurrentPrincipal() principal: Principal,
    @Param("assetId") assetId: string,
    @Body() body: MediaReviewDto
  ) {
    const admin = requireAdmin(principal);
    if (!body.manualReviewStatus && !body.wechatReviewStatus) {
      throw Errors.badRequest("REVIEW_STATUS_REQUIRED", "A media review status is required");
    }
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, isCurrent: true },
      include: { episode: { include: { drama: true } } }
    });
    if (!asset) throw Errors.notFound("Current media asset");
    assertNotSelfReview(asset.episode.drama.editorId, admin.sub);
    if (asset.episode.drama.status === "PUBLISHED") {
      throw Errors.conflict("PUBLISHED_DRAMA_IMMUTABLE", "Offline the drama before reviewing media");
    }
    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        ...(body.manualReviewStatus
          ? { manualReviewStatus: body.manualReviewStatus }
          : {}),
        ...(body.wechatReviewStatus
          ? { wechatReviewStatus: body.wechatReviewStatus }
          : {})
      }
    });
    await this.prisma.drama.update({
      where: { id: asset.episode.dramaId },
      data: { contentVersion: { increment: 1 }, status: "DRAFT" }
    });
    await this.audit(admin.sub, "MEDIA_REVIEWED", "MediaAsset", asset.id, {
      reason: body.notes
    });
    return updated;
  }

  @Get("reviews")
  @Roles(AdminRole.REVIEWER)
  async reviews() {
    const items = await this.prisma.drama.findMany({
      where: { status: "PENDING_REVIEW" },
      include: { editor: { select: { id: true, email: true } } },
      orderBy: { updatedAt: "asc" }
    });
    return {
      items: items.map((drama) => ({
        id: `pending:${drama.id}`,
        dramaId: drama.id,
        dramaTitle: drama.title,
        submitterId: drama.editor.id,
        submitterName: drama.editor.email,
        submittedAt: drama.updatedAt.toISOString(),
        riskFlags: [],
        status: "PENDING" as const
      })),
      total: items.length
    };
  }

  @Get("audit-logs")
  @Roles(AdminRole.ADMIN)
  async auditLogs(@Query("query") query = "") {
    const normalized = query.trim().slice(0, 100);
    const logs = await this.prisma.auditLog.findMany({
      where: normalized
        ? {
            OR: [
              { action: { contains: normalized } },
              { targetType: { contains: normalized } },
              { targetId: { contains: normalized } },
              { requestId: { contains: normalized } }
            ]
          }
        : {},
      include: { admin: { select: { email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return {
      items: logs.map((log) => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        actorName: log.admin.email,
        actorRole: log.admin.role,
        action: log.action,
        target: `${log.targetType}:${log.targetId}`,
        result: "SUCCESS" as const,
        requestId: log.requestId ?? "",
        detail: auditDetail(log.metadataJson)
      })),
      total: logs.length
    };
  }

  @Get("circuit-breakers")
  @Roles(AdminRole.ADMIN)
  async circuitBreakers() {
    const row = await this.prisma.circuitBreaker.findUnique({
      where: { provider: "GLOBAL:GLOBAL" }
    });
    return {
      enabled: row?.state === "OPEN",
      reason: row?.reason ?? "",
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null
    };
  }

  @Patch("circuit-breakers")
  @Roles(AdminRole.ADMIN)
  async setCircuitCollection(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CircuitCollectionDto
  ) {
    const admin = requireAdmin(principal);
    const scope = body.scope ?? "GLOBAL";
    if (scope !== "GLOBAL" && !body.targetId) {
      throw Errors.badRequest("TARGET_REQUIRED", "targetId is required for a scoped circuit breaker");
    }
    const key = `${scope}:${body.targetId ?? "GLOBAL"}`;
    const row = await this.prisma.circuitBreaker.upsert({
      where: { provider: key },
      create: {
        provider: key,
        state: body.enabled ? "OPEN" : "CLOSED",
        reason: body.reason,
        openedAt: body.enabled ? new Date() : null,
        updatedBy: admin.sub
      },
      update: {
        state: body.enabled ? "OPEN" : "CLOSED",
        reason: body.reason,
        openedAt: body.enabled ? new Date() : null,
        updatedBy: admin.sub
      }
    });
    await this.audit(admin.sub, "CIRCUIT_CHANGED", "CircuitBreaker", key);
    return {
      enabled: row.state === "OPEN",
      reason: row.reason ?? "",
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: admin.sub
    };
  }

  @Patch("circuit-breakers/:provider")
  @Roles(AdminRole.ADMIN)
  async setCircuit(
    @CurrentPrincipal() principal: Principal,
    @Param("provider") provider: string,
    @Body() body: CircuitDto
  ) {
    const admin = requireAdmin(principal);
    const row = await this.prisma.circuitBreaker.upsert({
      where: { provider },
      create: {
        provider,
        state: body.state,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        openedAt: body.state === "OPEN" ? new Date() : null,
        updatedBy: admin.sub
      },
      update: {
        state: body.state,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        openedAt: body.state === "OPEN" ? new Date() : null,
        updatedBy: admin.sub
      }
    });
    await this.audit(admin.sub, "CIRCUIT_CHANGED", "CircuitBreaker", provider);
    return row;
  }

  @Post("entitlements/compensate")
  @Roles(AdminRole.ADMIN)
  async compensate(
    @CurrentPrincipal() principal: Principal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CompensateDto
  ) {
    const admin = requireAdmin(principal);
    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw Errors.badRequest("INVALID_EXPIRY", "Expiry must be in the future");
    }
    const { grant, replayed } = await createIdempotentCompensation(this.prisma, {
      compensationKey: normalizeIdempotencyKey(idempotencyKey),
      userId: body.userId,
      dramaId: body.dramaId,
      seconds: body.seconds,
      expiresAt,
      reason: body.reason
    });
    if (!replayed) {
      await this.audit(admin.sub, "ENTITLEMENT_COMPENSATED", "EntitlementGrant", grant.id);
    }
    return grant;
  }

  @Post("entitlements/adjustments")
  @Roles(AdminRole.ADMIN)
  async adjust(
    @CurrentPrincipal() principal: Principal,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: AdjustEntitlementDto
  ) {
    const admin = requireAdmin(principal);
    const view = await createIdempotentAdjustment(this.prisma, {
      type: body.type,
      grantId: body.grantId,
      seconds: body.seconds,
      reason: body.reason,
      operatorAdminId: admin.sub,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(body.sourceFactType ? { sourceFactType: body.sourceFactType } : {}),
      ...(body.sourceFactId ? { sourceFactId: body.sourceFactId } : {}),
      ...(body.freezeAdjustmentId ? { freezeAdjustmentId: body.freezeAdjustmentId } : {}),
      ...(body.approvalNote ? { approvalNote: body.approvalNote } : {})
    });
    if (!view.replayed) {
      await this.audit(admin.sub, "ENTITLEMENT_ADJUSTED", "EntitlementAdjustment", view.id, {
        type: view.type,
        grantId: view.grantId
      });
    }
    return view;
  }

  @Get("callback-events")
  @Roles(AdminRole.ADMIN)
  listCallbackEvents(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string
  ) {
    return listAdminCallbackEvents(this.prisma, {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(take !== undefined ? { take: Number.parseInt(take, 10) } : {}),
      ...(skip !== undefined ? { skip: Number.parseInt(skip, 10) } : {})
    });
  }

  @Post("callback-events/:eventId/replay")
  @Roles(AdminRole.ADMIN)
  async replayCallback(
    @CurrentPrincipal() principal: Principal,
    @Param("eventId") eventId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ReplayCallbackDto
  ) {
    const admin = requireAdmin(principal);
    const view = await replayCallbackEvent(
      this.prisma,
      {
        eventId,
        reason: body.reason,
        operatorAdminId: admin.sub,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(body.approvalNote ? { approvalNote: body.approvalNote } : {})
      },
      {
        ...withEncryptionKey(resolvePayloadEncryptionKey(this.config.env)),
        verifyReward: (input) => this.wechat.verifyReward(input)
      }
    );
    if (!view.replayed) {
      await this.audit(admin.sub, "CALLBACK_REPLAYED", "CallbackEvent", view.eventId, {
        status: view.status,
        attempts: String(view.attempts),
        executed: view.executed ? "true" : "false"
      });
    }
    return view;
  }

  @Get("deletion-requests")
  @Roles(AdminRole.ADMIN)
  lookupDeletionRequestByUser(
    @Query("userId") userId: string | undefined
  ) {
    if (!userId?.trim()) {
      throw Errors.badRequest("USER_ID_REQUIRED", "userId is required");
    }
    return lookupAdminDeletionRequest(this.prisma, { userId });
  }

  @Get("deletion-requests/:deletionRequestId")
  @Roles(AdminRole.ADMIN)
  getDeletionRequest(@Param("deletionRequestId") deletionRequestId: string) {
    return lookupAdminDeletionRequest(this.prisma, { deletionRequestId });
  }

  @Post("deletion-requests/:deletionRequestId/query-tokens")
  @Roles(AdminRole.ADMIN)
  async reissueDeletionQueryToken(
    @CurrentPrincipal() principal: Principal,
    @Param("deletionRequestId") deletionRequestId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ReissueDeletionQueryTokenDto
  ) {
    const admin = requireAdmin(principal);
    const view = await issueDeletionQueryToken(this.prisma, {
      deletionRequestId,
      userId: body.userId,
      reason: body.reason,
      approvalNote: body.approvalNote,
      operatorAdminId: admin.sub,
      ...(idempotencyKey ? { idempotencyKey } : {})
    });
    if (!view.replayed) {
      await this.audit(admin.sub, "DELETION_QUERY_TOKEN_REISSUED", "DeletionRequest", view.deletionRequestId, {
        userId: body.userId
      });
    }
    return view;
  }

  @Get("release-gate")
  releaseGate(): ReleaseGateStatus {
    const env = this.config.env;
    return releaseGateStatus({
      entityApproved: env.COMPLIANCE_ENTITY_APPROVED,
      miniProgramFilingApproved: env.COMPLIANCE_MINIPROGRAM_FILING,
      wechatCategoryApproved: env.COMPLIANCE_WECHAT_CATEGORY,
      adsApproved: env.COMPLIANCE_ADS_APPROVED,
      providerModesReady: env.WECHAT_MODE === "live" && env.VOD_MODE === "live",
      providerImplementationsReady: LIVE_PROVIDER_IMPLEMENTATIONS_READY,
      serverVerificationReady: env.WECHAT_REWARD_VERIFICATION === "server_verified"
    });
  }

  private async audit(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, string>
  ): Promise<void> {
    const requestId = currentRequestId().slice(0, 128);
    await this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        ...(requestId ? { requestId } : {}),
        ...(metadata ? { metadataJson: metadata } : {})
      }
    });
  }

  private async loadDramaView(dramaId: string, admin: AdminPrincipal) {
    const drama = await this.prisma.drama.findUnique({
      where: { id: dramaId },
      include: {
        editor: { select: { email: true } },
        rightsRecords: { orderBy: { version: "desc" }, take: 1 },
        episodes: { include: { mediaAssets: { where: { isCurrent: true }, take: 1 } } },
        reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" } }
      }
    });
    return toAdminDrama(assertEditorOwns(drama, admin));
  }

  private async requireOwnedDrama(dramaId: string, admin: AdminPrincipal) {
    const drama = await this.prisma.drama.findUnique({
      where: { id: dramaId },
      select: { id: true, editorId: true, status: true }
    });
    return assertEditorOwns(drama, admin);
  }

  private async requireOwnedUnpublishedDrama(dramaId: string, admin: AdminPrincipal) {
    const drama = await this.requireOwnedDrama(dramaId, admin);
    assertNotPublished(drama.status);
    return drama;
  }
}

function auditDetail(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const reason = (value as Record<string, unknown>)["reason"];
  return typeof reason === "string" ? reason : "";
}

export function toAdminDrama(drama: {
  id: string;
  title: string;
  summary: string;
  category: string;
  tagsJson: unknown;
  coverUrl: string;
  status: string;
  contentVersion: number;
  editorId: string;
  updatedAt: Date;
  editor?: { email: string };
  rightsRecords: Array<{
    rightsHolder: string;
    licenseNumber: string;
    validFrom: Date;
    validUntil: Date;
    reportNumber: string;
    materialObjectKey: string;
    materialDigestSha256: string;
    allowsWechatDistribution: boolean;
    allowsAdMonetization: boolean;
    allowsTranscoding: boolean;
    allowsPromotionalMaterial: boolean;
  }>;
  reviews: Array<{ status: string; contentVersion: number }>;
  episodes: Array<{
    id: string;
    episodeNumber: number;
    title: string;
    durationSeconds: number;
    updatedAt: Date;
    mediaAssets: Array<{
      id: string;
      mediaStatus: string;
      transcodeStatus: string;
      machineReviewStatus: string;
      manualReviewStatus: string;
      wechatReviewStatus: string;
      fileId: string;
    }>;
  }>;
}) {
  const rights = drama.rightsRecords[0];
  return {
    id: drama.id,
    title: drama.title,
    summary: drama.summary,
    category: drama.category,
    tags: Array.isArray(drama.tagsJson)
      ? drama.tagsJson.filter((tag): tag is string => typeof tag === "string")
      : [],
    coverUrl: drama.coverUrl,
    status: drama.status,
    ownerId: drama.editorId,
    ownerName: drama.editor?.email ?? "",
    rightsHolder: rights?.rightsHolder ?? "",
    licenseNumber: rights?.licenseNumber ?? "",
    validFrom: rights?.validFrom.toISOString() ?? "",
    validUntil: rights?.validUntil.toISOString() ?? "",
    rightsValidFrom: rights?.validFrom.toISOString() ?? "",
    rightsValidUntil: rights?.validUntil.toISOString() ?? "",
    reportNumber: rights?.reportNumber ?? "",
    materialObjectKey: rights?.materialObjectKey ?? "",
    materialDigestSha256: rights?.materialDigestSha256 ?? "",
    rightsReportNumber: rights?.reportNumber ?? "",
    rightsMaterialObjectKey: rights?.materialObjectKey ?? "",
    rightsMaterialDigestSha256: rights?.materialDigestSha256 ?? "",
    allowsWechatDistribution: rights?.allowsWechatDistribution ?? false,
    allowsAdMonetization: rights?.allowsAdMonetization ?? false,
    allowsTranscoding: rights?.allowsTranscoding ?? false,
    allowsPromotionalMaterial: rights?.allowsPromotionalMaterial ?? false,
    licenseExpiresAt: rights?.validUntil.toISOString() ?? "",
    licenseDocumentName: rights?.materialObjectKey.split("/").at(-1) ?? "",
    contentApproved: drama.reviews.some(
      (review) =>
        review.status === "APPROVED" && review.contentVersion === drama.contentVersion
    ),
    copyrightVerified: Boolean(rights),
    wechatApproved: drama.episodes.every(
      (episode) => isAdminAssetReady(episode.mediaAssets[0])
    ),
    episodes: drama.episodes.map((episode) => ({
      id: episode.id,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      durationSeconds: episode.durationSeconds,
      assetId: episode.mediaAssets[0]?.id ?? null,
      mediaStatus: episode.mediaAssets[0]?.mediaStatus ?? "CREATED",
      transcodeStatus: episode.mediaAssets[0]?.transcodeStatus ?? "PENDING",
      machineReviewStatus: episode.mediaAssets[0]?.machineReviewStatus ?? "PENDING",
      manualReviewStatus: episode.mediaAssets[0]?.manualReviewStatus ?? "PENDING",
      wechatReviewStatus: episode.mediaAssets[0]?.wechatReviewStatus ?? "PENDING",
      ...(episode.mediaAssets[0]?.fileId
        ? { vodFileId: episode.mediaAssets[0].fileId }
        : {}),
      updatedAt: episode.updatedAt.toISOString()
    })),
    updatedAt: drama.updatedAt.toISOString()
  };
}

function isAdminAssetReady(
  asset:
    | {
        mediaStatus: string;
        transcodeStatus: string;
        machineReviewStatus: string;
        manualReviewStatus: string;
        wechatReviewStatus: string;
      }
    | undefined
): boolean {
  return (
    asset?.mediaStatus === "READY" &&
    asset.transcodeStatus === "READY" &&
    asset.machineReviewStatus === "APPROVED" &&
    asset.manualReviewStatus === "APPROVED" &&
    asset.wechatReviewStatus === "APPROVED"
  );
}

function requireAdmin(principal: Principal): Extract<Principal, { kind: "admin" }> {
  if (principal.kind !== "admin") throw Errors.forbidden();
  return principal;
}

function assertUniqueEpisodeNumbers(episodes: EpisodeInput[]): void {
  const numbers = new Set(episodes.map((episode) => episode.episodeNumber));
  if (!episodes.length || numbers.size !== episodes.length) {
    throw Errors.badRequest(
      "INVALID_EPISODES",
      "At least one episode with a unique stable episode number is required"
    );
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
