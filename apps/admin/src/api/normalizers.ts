import {
  AdminRole,
  DramaStatus,
  MediaStatus,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import type {
  AdminSession,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  AdminCallbackEvent,
  CallbackReplayInput,
  DeletionQueryTokenReissueInput,
  DashboardData,
  DramaRecord,
  EpisodeRecord,
  ReviewItem,
  UploadSignature,
  PageResult,
} from "@/types/admin";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateText(value: unknown): string {
  const candidate = text(value);
  return candidate && !Number.isNaN(new Date(candidate).getTime()) ? candidate : "";
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

function latestRecord(value: unknown): UnknownRecord {
  return record(array(value)[0]);
}

function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return array(record(value).items);
}

function normalizeEpisode(value: unknown): EpisodeRecord {
  const source = record(value);
  const assets = array(source.mediaAssets).map(record);
  const currentAsset = assets.find((asset) => asset.isCurrent === true) ?? assets[0] ?? {};
  return {
    id: text(source.id),
    episodeNumber: Math.max(0, Math.round(finiteNumber(source.episodeNumber))),
    title: text(source.title),
    durationSeconds: Math.max(0, Math.round(finiteNumber(source.durationSeconds))),
    mediaStatus: enumValue(
      currentAsset.mediaStatus ?? source.mediaStatus,
      Object.values(MediaStatus),
      MediaStatus.CREATED,
    ),
    transcodeStatus: enumValue(
      currentAsset.transcodeStatus ?? source.transcodeStatus,
      ["PENDING", "PROCESSING", "READY", "FAILED"] as const,
      "PENDING",
    ),
    machineReviewStatus: enumValue(
      currentAsset.machineReviewStatus ?? source.machineReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    manualReviewStatus: enumValue(
      currentAsset.manualReviewStatus ?? source.manualReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    wechatReviewStatus: enumValue(
      currentAsset.wechatReviewStatus ?? source.wechatReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    ...(text(currentAsset.fileId) || text(source.vodFileId)
      ? { vodFileId: text(currentAsset.fileId) || text(source.vodFileId) }
      : {}),
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeAdminSession(value: unknown): AdminSession {
  const source = record(value);
  const admin = record(source.admin);
  const accessToken = text(source.accessToken);
  const id = text(admin.id);
  const email = text(admin.email);
  const role = enumValue(admin.role, Object.values(AdminRole), "" as AdminRole);
  if (!accessToken || !id || !email || !role) {
    throw new Error("登录响应缺少有效的管理员会话信息");
  }
  return {
    accessToken,
    user: {
      id,
      email,
      name: email,
      role,
    },
  };
}

export function normalizeReleaseGate(value: unknown): ReleaseGateStatus {
  const source = record(value);
  const entityApproved = source.entityApproved === true;
  const miniProgramFilingApproved = source.miniProgramFilingApproved === true;
  const wechatCategoryApproved = source.wechatCategoryApproved === true;
  const adsApproved = source.adsApproved === true;
  return {
    entityApproved,
    miniProgramFilingApproved,
    wechatCategoryApproved,
    adsApproved,
    readyForExternalTraffic:
      source.readyForExternalTraffic === true &&
      entityApproved &&
      miniProgramFilingApproved &&
      wechatCategoryApproved &&
      adsApproved,
    blockers: array(source.blockers).filter((item): item is string => typeof item === "string"),
  };
}

export function normalizeDashboard(value: unknown, gateValue: unknown): DashboardData {
  const source = record(value);
  const statusCountsSource = record(source.statusCounts);
  const statusCounts = Object.fromEntries(
    Object.values(DramaStatus).map((status) => [
      status,
      Math.max(0, Math.round(finiteNumber(statusCountsSource[status]))),
    ]),
  ) as Partial<Record<DramaStatus, number>>;
  if (!(DramaStatus.PUBLISHED in statusCountsSource) && finiteNumber(source.published) > 0) {
    statusCounts[DramaStatus.PUBLISHED] = Math.round(finiteNumber(source.published));
  }
  if (!(DramaStatus.PENDING_REVIEW in statusCountsSource) && finiteNumber(source.pendingReviews) > 0) {
    statusCounts[DramaStatus.PENDING_REVIEW] = Math.round(finiteNumber(source.pendingReviews));
  }
  return {
    releaseGate: normalizeReleaseGate(gateValue),
    statusCounts,
    reviewBacklog: Math.max(
      0,
      Math.round(finiteNumber(source.reviewBacklog ?? source.pendingReviews)),
    ),
    metricSourceConfigured: source.metricSourceConfigured === true,
    callbackOps: normalizeCallbackOps(source.callbackOps),
  };
}

function normalizeCallbackOps(value: unknown): DashboardData["callbackOps"] {
  const source = record(value);
  const oldest = source.oldestUnprocessedAgeSeconds;
  return {
    deadLetterCount: Math.max(0, Math.round(finiteNumber(source.deadLetterCount))),
    retryableCount: Math.max(0, Math.round(finiteNumber(source.retryableCount))),
    oldestUnprocessedAgeSeconds:
      typeof oldest === "number" && Number.isFinite(oldest) ? Math.max(0, Math.round(oldest)) : null,
    openProviderCircuits: array(source.openProviderCircuits).filter(
      (item): item is string => typeof item === "string" && item.startsWith("PROVIDER:"),
    ),
  };
}

export function normalizeDrama(value: unknown): DramaRecord {
  const source = record(value);
  const editor = record(source.editor);
  const rights = latestRecord(source.rightsRecords);
  const reviews = array(source.reviews).map(record);
  const approvedReview = reviews.some((review) => review.status === "APPROVED");
  const episodes = array(source.episodes).map(normalizeEpisode);
  const hasEpisodes = episodes.length > 0;
  const assets = array(source.episodes).map((episode) => {
    const mediaAssets = array(record(episode).mediaAssets).map(record);
    return mediaAssets.find((asset) => asset.isCurrent === true) ?? mediaAssets[0] ?? {};
  });
  return {
    id: text(source.id),
    title: text(source.title),
    summary: text(source.summary),
    category: text(source.category),
    tags: array(source.tags ?? source.tagsJson).filter(
      (item): item is string => typeof item === "string",
    ),
    coverUrl: text(source.coverUrl),
    status: enumValue(source.status, Object.values(DramaStatus), DramaStatus.DRAFT),
    ownerId: text(source.ownerId) || text(source.editorId) || text(editor.id),
    ownerName: text(source.ownerName) || text(editor.email),
    rightsHolder: text(rights.rightsHolder) || text(source.rightsHolder),
    licenseNumber: text(rights.licenseNumber) || text(source.licenseNumber),
    rightsValidFrom: dateText(source.rightsValidFrom) || dateText(rights.validFrom),
    licenseExpiresAt: dateText(rights.validUntil) || dateText(source.licenseExpiresAt),
    rightsReportNumber:
      text(source.rightsReportNumber) || text(source.reportNumber) || text(rights.reportNumber),
    rightsMaterialObjectKey:
      text(source.rightsMaterialObjectKey) ||
      text(source.materialObjectKey) ||
      text(rights.materialObjectKey),
    rightsMaterialDigestSha256:
      text(source.rightsMaterialDigestSha256) ||
      text(source.materialDigestSha256) ||
      text(rights.materialDigestSha256),
    allowsWechatDistribution:
      source.allowsWechatDistribution === true || rights.allowsWechatDistribution === true,
    allowsAdMonetization:
      source.allowsAdMonetization === true || rights.allowsAdMonetization === true,
    allowsTranscoding:
      source.allowsTranscoding === true || rights.allowsTranscoding === true,
    allowsPromotionalMaterial:
      source.allowsPromotionalMaterial === true ||
      rights.allowsPromotionalMaterial === true,
    contentApproved: source.contentApproved === true || approvedReview,
    copyrightVerified: source.copyrightVerified === true || rights.status === "ACTIVE",
    wechatApproved:
      source.wechatApproved === true ||
      (hasEpisodes &&
        assets.length === episodes.length &&
        assets.every((asset) => asset.wechatReviewStatus === "APPROVED")),
    episodes,
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeDramaList(value: unknown): DramaRecord[] {
  return collection(value).map(normalizeDrama).filter((drama) => drama.id.length > 0);
}

export function normalizeReviewList(value: unknown): ReviewItem[] {
  return collection(value)
    .map((item) => {
      const source = record(item);
      const editor = record(source.editor);
      const dramaId = text(source.dramaId) || text(source.id);
      return {
        id: text(source.id) || dramaId,
        dramaId,
        dramaTitle: text(source.dramaTitle) || text(source.title),
        submitterId: text(source.submitterId) || text(source.editorId) || text(editor.id),
        submitterName: text(source.submitterName) || text(editor.email),
        submittedAt: dateText(source.submittedAt) || dateText(source.updatedAt),
        riskFlags: Array.isArray(source.riskFlags)
          ? source.riskFlags.filter((flag): flag is string => typeof flag === "string")
          : ["自动风险标记未返回，请完整人工复核"],
        status: enumValue(
          source.status,
          ["PENDING", "APPROVED", "REJECTED"] as const,
          "PENDING",
        ),
      };
    })
    .filter((item) => item.dramaId.length > 0);
}

export function normalizeAuditList(value: unknown): AuditLog[] {
  return collection(value)
    .map((item) => {
      const source = record(item);
      return {
        id: text(source.id),
        createdAt: dateText(source.createdAt),
        actorName: text(source.actorName) || text(source.adminId),
        actorRole:
          typeof source.actorRole === "string" &&
          Object.values(AdminRole).includes(source.actorRole as AdminRole)
            ? (source.actorRole as AdminRole)
            : null,
        action: text(source.action),
        target:
          text(source.target) ||
          [text(source.targetType), text(source.targetId)].filter(Boolean).join(" · "),
        result: enumValue(
          source.result,
          ["SUCCESS", "DENIED", "FAILED", "UNKNOWN"] as const,
          "UNKNOWN",
        ),
        requestId: text(source.requestId),
        detail: text(source.detail),
      };
    })
    .filter((item) => item.id.length > 0);
}

export function normalizeCallbackEventList(value: unknown): PageResult<AdminCallbackEvent> {
  const source = record(value);
  const items = collection(value)
    .map((item) => {
      const row = record(item);
      return {
        eventId: text(row.eventId) || text(row.id),
        provider: text(row.provider),
        eventType: text(row.eventType),
        status: text(row.status),
        attempts: Math.max(0, Math.round(finiteNumber(row.attempts))),
        receivedAt: dateText(row.receivedAt),
        processedAt: dateText(row.processedAt) || null,
        processingUntil: dateText(row.processingUntil) || null,
        outcome: text(row.outcome) || null,
        payloadAvailable: row.payloadAvailable === true,
        replayable: row.replayable === true,
      };
    })
    .filter((item) => item.eventId.length > 0);
  return {
    items,
    total: Math.max(items.length, Math.round(finiteNumber(source.total))),
  };
}

export function normalizeCircuitBreaker(value: unknown): CircuitBreakerState {
  const direct = record(value);
  if (typeof direct.enabled === "boolean") {
    return {
      enabled: direct.enabled,
      reason: text(direct.reason),
      updatedAt: dateText(direct.updatedAt) || null,
      updatedBy: text(direct.updatedBy) || null,
    };
  }
  const rows = collection(value).map(record);
  const global = rows.find((row) => row.provider === "GLOBAL:GLOBAL" || row.provider === "GLOBAL");
  if (!global) {
    return { enabled: false, reason: "", updatedAt: null, updatedBy: null };
  }
  return {
    enabled: global.state === "OPEN",
    reason: text(global.reason),
    updatedAt: dateText(global.updatedAt) || null,
    updatedBy: null,
  };
}

export function normalizeUploadSignature(value: unknown): UploadSignature {
  const source = record(value);
  const rawHeaders = record(source.headers);
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    uploadUrl: text(source.uploadUrl),
    headers,
    uploadId: text(source.uploadId),
    expiresAt: dateText(source.expiresAt),
    mock: source.mock === true,
  };
}
