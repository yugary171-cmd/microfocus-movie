import {
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  CatalogTagStatus,
  DramaStatus,
  MediaStatus,
  isCatalogTagGroupId,
  type CatalogTag,
  type ReleaseGateStatus,
  type AdminAuditContext,
} from "@microfocus/contracts";
import type {
  AdminSession,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  AdminCallbackEvent,
  AdminFeedbackRecord,
  AdminNotificationRecord,
  AdminAccountRecord,
  AdminAccountSetupInfo,
  AdminSetupLink,
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
      name: text(admin.displayName) || email,
      role,
    },
  };
}

export function normalizeAdminAccount(value: unknown): AdminAccountRecord {
  const source = record(value);
  const id = text(source.id);
  const displayName = text(source.displayName);
  const email = text(source.email).toLowerCase();
  const role = enumValue(source.role, Object.values(AdminRole), "" as AdminRole);
  const status = enumValue(
    source.status,
    Object.values(AdminAccountStatus),
    AdminAccountStatus.PENDING_SETUP,
  );
  if (!id || !displayName || !email || !role) {
    throw new Error("账号列表响应缺少必要字段");
  }
  return {
    id,
    displayName,
    email,
    role,
    status,
    totpEnabled: source.totpEnabled === true,
    ownedDramaCount: Math.max(0, Math.round(finiteNumber(source.ownedDramaCount))),
    setupCompletedAt: dateText(source.setupCompletedAt) || null,
    lastLoginAt: dateText(source.lastLoginAt) || null,
    createdAt: dateText(source.createdAt),
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeAdminAccountList(value: unknown): PageResult<AdminAccountRecord> {
  const source = record(value);
  const items = collection(value).map(normalizeAdminAccount);
  const returnedTotal = finiteNumber(source.total);
  return { items, total: returnedTotal >= 0 ? Math.round(returnedTotal) : items.length };
}

export function normalizeAdminSetupLink(value: unknown): AdminSetupLink {
  const source = record(value);
  const setupUrl = text(source.setupUrl);
  const expiresAt = dateText(source.expiresAt);
  const purpose = enumValue(
    source.purpose,
    Object.values(AdminSetupPurpose),
    AdminSetupPurpose.INVITE,
  );
  const setupToken = text(source.setupToken);
  const account = normalizeAdminAccount(source.account);
  if (!setupUrl || !setupToken || !expiresAt) throw new Error("开通链接响应不完整，请重试");
  return { account, setupUrl, setupToken, expiresAt, purpose };
}

export function normalizeAdminAccountSetupInfo(value: unknown): AdminAccountSetupInfo {
  const source = record(value);
  const displayName = text(source.displayName);
  const email = text(source.email).toLowerCase();
  const role = enumValue(source.role, Object.values(AdminRole), "" as AdminRole);
  const purpose = enumValue(
    source.purpose,
    Object.values(AdminSetupPurpose),
    AdminSetupPurpose.INVITE,
  );
  const otpauthUri = text(source.otpauthUri);
  const manualKey = text(source.manualKey);
  const expiresAt = dateText(source.expiresAt);
  if (!displayName || !email || !role || !otpauthUri || !manualKey || !expiresAt) {
    throw new Error("开通信息响应不完整，请重新获取链接");
  }
  return { displayName, email, role, purpose, otpauthUri, manualKey, expiresAt };
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
    ledgerOps: normalizeLedgerOps(source.ledgerOps),
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

function normalizeLedgerOps(value: unknown): DashboardData["ledgerOps"] {
  const source = record(value);
  const lastReconciledAt = text(source.lastReconciledAt);
  return {
    mismatchCount: Math.max(0, Math.round(finiteNumber(source.mismatchCount))),
    mismatchedSeconds: Math.max(0, Math.round(finiteNumber(source.mismatchedSeconds))),
    missingGrants: Math.max(0, Math.round(finiteNumber(source.missingGrants))),
    lastReconciledAt: lastReconciledAt || null,
    ledgerCircuitOpen: source.ledgerCircuitOpen === true,
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
    tags: array(source.tags).filter((item): item is string => typeof item === "string"),
    tagIds: array(source.tagIds ?? source.tagsJson).filter((item): item is string => typeof item === "string"),
    coverUrl: text(source.coverUrl),
    promoCoverUrl: text(source.promoCoverUrl),
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

export function pageTotal(value: unknown, itemsLength: number): number {
  const source = record(value);
  if (!("total" in source)) return itemsLength;
  const total = Math.round(finiteNumber(source.total));
  return total >= 0 ? total : itemsLength;
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
      const context = normalizeAuditContext(source.context);
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
        ...(context ? { context } : {}),
      };
    })
    .filter((item) => item.id.length > 0);
}

export function normalizeAdminNotificationList(value: unknown): PageResult<AdminNotificationRecord> {
  const source = record(value);
  const items = collection(value).map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      title: text(row.title),
      body: text(row.body),
      status: enumValue(row.status, ["DRAFT", "PUBLISHED", "RETRACTED"] as const, "DRAFT"),
      publishedAt: dateText(row.publishedAt) || null,
      createdAt: dateText(row.createdAt),
      createdByAdminId: text(row.createdByAdminId),
      createdByAdminName: text(row.createdByAdminName) || "未知管理员",
    } as AdminNotificationRecord;
  }).filter((item) => item.id.length > 0);
  return { items, total: finiteNumber(source.total) || items.length };
}

export function normalizeAdminFeedbackList(value: unknown): PageResult<AdminFeedbackRecord> {
  const source = record(value);
  const items = collection(value).map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      body: text(row.body),
      status: enumValue(row.status, ["NEW", "PROCESSING", "RESOLVED"] as const, "NEW"),
      internalNote: typeof row.internalNote === "string" ? row.internalNote : null,
      createdAt: dateText(row.createdAt),
      updatedAt: dateText(row.updatedAt),
      replies: Array.isArray(row.replies) ? row.replies.map((reply) => {
        const item = record(reply);
        return { id: text(item.id), body: text(item.body), createdAt: dateText(item.createdAt) };
      }) : [],
      userId: text(row.userId),
      userName: text(row.userName),
      ...(text(row.userEmail) ? { userEmail: text(row.userEmail) } : {}),
      handledByAdminId: text(row.handledByAdminId) || null,
    } as AdminFeedbackRecord;
  }).filter((item) => item.id.length > 0);
  return { items, total: finiteNumber(source.total) || items.length };
}

function normalizeAuditContext(value: unknown): AdminAuditContext | undefined {
  const source = record(value);
  const context: AdminAuditContext = {};
  const stringKeys = [
    "dramaId", "episodeId", "mediaAssetId", "fileId", "fileName", "fromStatus", "toStatus",
    "reviewStatus", "manualReviewStatus", "wechatReviewStatus", "fromManualReviewStatus",
    "toManualReviewStatus", "fromWechatReviewStatus", "toWechatReviewStatus", "uploadPhase"
  ] as const;
  for (const key of stringKeys) {
    if (typeof source[key] === "string") Object.assign(context, { [key]: source[key] });
  }
  const numberKeys = ["episodeNumber", "mediaVersion", "contentVersion"] as const;
  for (const key of numberKeys) {
    if (typeof source[key] === "number" && Number.isFinite(source[key])) Object.assign(context, { [key]: source[key] });
  }
  return Object.keys(context).length ? context : undefined;
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
    updatedBy: text(global.updatedBy) || null,
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

export function normalizeCatalogTag(value: unknown): CatalogTag | null {
  const source = record(value);
  const group = text(source.group);
  const name = text(source.name).trim();
  const id = text(source.id);
  if (!id || !name || !isCatalogTagGroupId(group)) return null;
  return {
    id,
    group,
    name,
    status: enumValue(source.status, Object.values(CatalogTagStatus), CatalogTagStatus.ACTIVE),
    sortOrder: Math.max(0, Math.round(finiteNumber(source.sortOrder))),
    ...(typeof source.usageCount === "number"
      ? { usageCount: Math.max(0, Math.round(source.usageCount)) }
      : {}),
  };
}

export function normalizeCatalogTagList(value: unknown): CatalogTag[] {
  const items = collection(value)
    .map(normalizeCatalogTag)
    .filter((item): item is CatalogTag => item !== null);
  if (items.length) return items;
  const single = normalizeCatalogTag(value);
  return single ? [single] : [];
}
