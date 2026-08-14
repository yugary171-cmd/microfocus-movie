import {
  AdminRole,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  DeletionRequestStatus,
  DramaStatus,
  MediaStatus,
  type ReissueDeletionQueryTokenResponse,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import type {
  AdminSession,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  CallbackReplayInput,
  DeletionQueryTokenReissueInput,
  DashboardData,
  DramaInput,
  DramaRecord,
  PageResult,
  AdminCallbackEvent,
  ReviewItem,
  UploadSignature,
} from "@/types/admin";
import { isRightsActive } from "@/policies/admin";

const now = new Date();
const isoHoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

const releaseGate: ReleaseGateStatus = {
  entityApproved: true,
  miniProgramFilingApproved: true,
  wechatCategoryApproved: false,
  adsApproved: false,
  readyForExternalTraffic: false,
  blockers: ["微信小程序类目审核尚未完成", "流量主广告能力尚未获批", "LIVE_PROVIDER_IMPLEMENTATION_REQUIRED"],
};

let dramas: DramaRecord[] = [
  {
    id: "drama-001",
    title: "晚风也曾拥抱你",
    summary: "城市修复师在一次旧宅委托中重逢少年时代的邻居。",
    category: "都市情感",
    tags: ["重逢", "治愈"],
    coverUrl: "",
    status: DramaStatus.PENDING_REVIEW,
    ownerId: "editor-1",
    ownerName: "林编辑",
    rightsHolder: "上海微焦影业有限公司",
    licenseNumber: "沪网微剧备字〔2026〕0123号",
    rightsValidFrom: "2026-01-01",
    licenseExpiresAt: "2028-12-31",
    rightsReportNumber: "沪微剧报〔2026〕0123号",
    rightsMaterialObjectKey: "rights/drama-001/license.pdf",
    rightsMaterialDigestSha256: "1".repeat(64),
    allowsWechatDistribution: true,
    allowsAdMonetization: true,
    allowsTranscoding: true,
    allowsPromotionalMaterial: true,
    contentApproved: false,
    copyrightVerified: true,
    wechatApproved: false,
    episodes: [
      {
        id: "ep-001",
        episodeNumber: 1,
        title: "旧宅来客",
        durationSeconds: 112,
        mediaStatus: MediaStatus.READY,
        transcodeStatus: "READY",
        machineReviewStatus: "APPROVED",
        manualReviewStatus: "APPROVED",
        wechatReviewStatus: "APPROVED",
        vodFileId: "mock-vod-001",
        updatedAt: isoHoursAgo(3),
      },
      {
        id: "ep-002",
        episodeNumber: 2,
        title: "雨夜重逢",
        durationSeconds: 106,
        mediaStatus: MediaStatus.PENDING_MANUAL_REVIEW,
        transcodeStatus: "READY",
        machineReviewStatus: "APPROVED",
        manualReviewStatus: "PENDING",
        wechatReviewStatus: "PENDING",
        vodFileId: "mock-vod-002",
        updatedAt: isoHoursAgo(2),
      },
    ],
    updatedAt: isoHoursAgo(1),
  },
  {
    id: "drama-002",
    title: "长街灯火",
    summary: "小城夜市摊主与纪录片导演共同守护即将消失的老街。",
    category: "现实生活",
    tags: ["烟火气", "小城"],
    coverUrl: "",
    status: DramaStatus.READY,
    ownerId: "editor-2",
    ownerName: "周编辑",
    rightsHolder: "微焦内容工作室",
    licenseNumber: "浙网微剧备字〔2026〕0088号",
    rightsValidFrom: "2025-10-20",
    licenseExpiresAt: "2027-10-20",
    rightsReportNumber: "浙微剧报〔2026〕0088号",
    rightsMaterialObjectKey: "rights/drama-002/license.pdf",
    rightsMaterialDigestSha256: "2".repeat(64),
    allowsWechatDistribution: true,
    allowsAdMonetization: true,
    allowsTranscoding: true,
    allowsPromotionalMaterial: true,
    contentApproved: true,
    copyrightVerified: true,
    wechatApproved: true,
    episodes: Array.from({ length: 4 }, (_, index) => ({
      id: `street-ep-${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 120 + index,
      mediaStatus: MediaStatus.READY,
      transcodeStatus: "READY" as const,
      machineReviewStatus: "APPROVED" as const,
      manualReviewStatus: "APPROVED" as const,
      wechatReviewStatus: "APPROVED" as const,
      vodFileId: `mock-street-${index + 1}`,
      updatedAt: isoHoursAgo(24 + index),
    })),
    updatedAt: isoHoursAgo(6),
  },
  {
    id: "drama-003",
    title: "未命名新项目",
    summary: "尚在完善中的剧目草稿。",
    category: "悬疑",
    tags: ["草稿"],
    coverUrl: "",
    status: DramaStatus.DRAFT,
    ownerId: "editor-1",
    ownerName: "林编辑",
    rightsHolder: "",
    licenseNumber: "",
    rightsValidFrom: "",
    licenseExpiresAt: "",
    rightsReportNumber: "",
    rightsMaterialObjectKey: "",
    rightsMaterialDigestSha256: "",
    allowsWechatDistribution: false,
    allowsAdMonetization: false,
    allowsTranscoding: false,
    allowsPromotionalMaterial: false,
    contentApproved: false,
    copyrightVerified: false,
    wechatApproved: false,
    episodes: [],
    updatedAt: isoHoursAgo(30),
  },
];

let reviews: ReviewItem[] = [
  {
    id: "review-001",
    dramaId: "drama-001",
    dramaTitle: "晚风也曾拥抱你",
    submitterId: "editor-1",
    submitterName: "林编辑",
    submittedAt: isoHoursAgo(1),
    riskFlags: ["第 2 集仍待媒体人工审核"],
    status: "PENDING",
  },
];

let auditLogs: AuditLog[] = [
  {
    id: "audit-001",
    createdAt: isoHoursAgo(1),
    actorName: "林编辑",
    actorRole: AdminRole.EDITOR,
    action: "提交审核",
    target: "晚风也曾拥抱你",
    result: "SUCCESS",
    requestId: "mock-req-001",
    detail: "内容进入待审核队列",
  },
  {
    id: "audit-002",
    createdAt: isoHoursAgo(6),
    actorName: "周审核",
    actorRole: AdminRole.REVIEWER,
    action: "版权复核",
    target: "长街灯火",
    result: "SUCCESS",
    requestId: "mock-req-002",
    detail: "版权链资料完整",
  },
];

let circuitBreaker: CircuitBreakerState = {
  enabled: false,
  reason: "",
  updatedAt: null,
  updatedBy: null,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function mockDelay<T>(value: T, delay = 160): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, delay));
  return clone(value);
}

function paginate<T>(items: T[], page = 1): PageResult<T> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  if (safePage > ADMIN_LIST_MAX_PAGE) return { items: [], total: 0 };
  const start = (safePage - 1) * ADMIN_LIST_PAGE_SIZE;
  return {
    items: items.slice(start, start + ADMIN_LIST_PAGE_SIZE),
    total: items.length,
  };
}

function writeAudit(action: string, target: string, detail: string): void {
  auditLogs.unshift({
    id: `audit-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    actorName: "当前演示用户",
    actorRole: AdminRole.ADMIN,
    action,
    target,
    result: "SUCCESS",
    requestId: `mock-${crypto.randomUUID().slice(0, 8)}`,
    detail,
  });
}

function assertMockRights(drama: DramaRecord): void {
  const hasRightsMaterial = Boolean(
    drama.rightsHolder.trim() &&
    drama.licenseNumber.trim() &&
    drama.rightsValidFrom &&
    drama.licenseExpiresAt &&
    isRightsActive(drama.rightsValidFrom, drama.licenseExpiresAt) &&
    drama.rightsReportNumber.trim() &&
    drama.rightsMaterialObjectKey.trim() &&
    /^[a-f0-9]{64}$/i.test(drama.rightsMaterialDigestSha256),
  );
  if (
    !hasRightsMaterial ||
    !drama.allowsWechatDistribution ||
    !drama.allowsAdMonetization ||
    !drama.allowsTranscoding ||
    !drama.allowsPromotionalMaterial
  ) {
    throw new Error("Mock 发布前请补齐版权资料并确认全部授权范围");
  }
}

function assertMockEpisodesReady(drama: DramaRecord): void {
  if (
    drama.episodes.length === 0 ||
    drama.episodes.some(
      (episode) =>
        episode.mediaStatus !== MediaStatus.READY ||
        episode.transcodeStatus !== "READY" ||
        episode.machineReviewStatus !== "APPROVED" ||
        episode.manualReviewStatus !== "APPROVED" ||
        episode.wechatReviewStatus !== "APPROVED",
    )
  ) {
    throw new Error("Mock 发布前请完成所有剧集的处理与审核");
  }
}

export const mockApi = {
  async login(email: string, _otp: string, role: AdminRole): Promise<AdminSession> {
    return mockDelay({
      accessToken: `mock-session-${crypto.randomUUID()}`,
      user: {
        id: role === AdminRole.EDITOR ? "editor-1" : `${role.toLowerCase()}-1`,
        name: role === AdminRole.EDITOR ? "林编辑" : role === AdminRole.REVIEWER ? "周审核" : "陈管理员",
        email,
        role,
      },
    });
  },
  async dashboard(): Promise<DashboardData> {
    const statusCounts = dramas.reduce<DashboardData["statusCounts"]>((counts, drama) => {
      counts[drama.status] = (counts[drama.status] ?? 0) + 1;
      return counts;
    }, {});
    return mockDelay({
      releaseGate,
      statusCounts,
      reviewBacklog: reviews.filter((item) => item.status === "PENDING").length,
      metricSourceConfigured: false,
      callbackOps: {
        deadLetterCount: 0,
        retryableCount: 0,
        oldestUnprocessedAgeSeconds: null,
        openProviderCircuits: [],
      },
      ledgerOps: {
        mismatchCount: 0,
        mismatchedSeconds: 0,
        missingGrants: 0,
        lastReconciledAt: null,
        ledgerCircuitOpen: false,
      },
    });
  },
  async releaseGate(): Promise<ReleaseGateStatus> {
    return mockDelay(releaseGate);
  },
  async listDramas(query = "", status = "", page = 1): Promise<PageResult<DramaRecord>> {
    const normalized = query.trim().toLowerCase();
    const items = dramas.filter(
      (drama) =>
        (!normalized ||
          drama.title.toLowerCase().includes(normalized) ||
          drama.ownerName.toLowerCase().includes(normalized)) &&
        (!status || drama.status === status),
    );
    return mockDelay(paginate(items, page));
  },
  async getDrama(id: string): Promise<DramaRecord> {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    return mockDelay(drama);
  },
  async saveDrama(input: DramaInput, id?: string): Promise<DramaRecord> {
    const existing = id ? dramas.find((item) => item.id === id) : undefined;
    const saved: DramaRecord = {
      id: existing?.id ?? `drama-${crypto.randomUUID()}`,
      ...input,
      status: existing?.status ?? DramaStatus.DRAFT,
      ownerId: existing?.ownerId ?? "editor-1",
      ownerName: existing?.ownerName ?? "林编辑",
      contentApproved: existing?.contentApproved ?? false,
      copyrightVerified: existing?.copyrightVerified ?? false,
      wechatApproved: existing?.wechatApproved ?? false,
      episodes: input.episodes.map((episode) => ({
        ...episode,
        transcodeStatus: episode.mediaStatus === MediaStatus.READY ? "READY" : "PENDING",
        machineReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        manualReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        wechatReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        updatedAt: new Date().toISOString(),
      })),
      updatedAt: new Date().toISOString(),
    };
    dramas = existing
      ? dramas.map((item) => (item.id === existing.id ? saved : item))
      : [saved, ...dramas];
    writeAudit(existing ? "编辑剧目" : "创建剧目", saved.title, "演示数据已保存在当前页面内存中");
    return mockDelay(saved);
  },
  async submitReview(id: string): Promise<void> {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    drama.status = DramaStatus.PENDING_REVIEW;
    reviews.unshift({
      id: `review-${crypto.randomUUID()}`,
      dramaId: id,
      dramaTitle: drama.title,
      submitterId: drama.ownerId,
      submitterName: drama.ownerName,
      submittedAt: new Date().toISOString(),
      riskFlags: [],
      status: "PENDING",
    });
    writeAudit("提交审核", drama.title, "进入演示审核队列");
    return mockDelay(undefined);
  },
  async listReviews(page = 1): Promise<PageResult<ReviewItem>> {
    return mockDelay(paginate(reviews, page));
  },
  async review(id: string, approved: boolean, reason: string): Promise<void> {
    const review = reviews.find((item) => item.id === id);
    if (!review) throw new Error("未找到审核任务");
    review.status = approved ? "APPROVED" : "REJECTED";
    const drama = dramas.find((item) => item.id === review.dramaId);
    if (drama) {
      drama.status = approved ? DramaStatus.READY : DramaStatus.DRAFT;
      drama.contentApproved = approved;
      drama.copyrightVerified = approved;
      drama.wechatApproved = approved;
    }
    writeAudit(approved ? "审核通过" : "审核拒绝", review.dramaTitle, reason || "未填写补充说明");
    return mockDelay(undefined);
  },
  async publish(id: string): Promise<void> {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    if (drama.status !== DramaStatus.READY) throw new Error("剧目尚未审核通过，不能发布");
    if (!drama.contentApproved || !drama.copyrightVerified || !drama.wechatApproved) {
      throw new Error("Mock 发布前请完成内容、版权和微信审核");
    }
    assertMockRights(drama);
    assertMockEpisodesReady(drama);
    drama.status = DramaStatus.PUBLISHED;
    writeAudit("发布剧目", drama.title, "仅更新演示数据，未触发真实发布");
    return mockDelay(undefined);
  },
  async offline(id: string, reason: string): Promise<void> {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    drama.status = DramaStatus.OFFLINE;
    writeAudit("下架剧目", drama.title, reason);
    return mockDelay(undefined);
  },
  async signUpload(file: File, dramaId: string, episodeId: string): Promise<UploadSignature> {
    return mockDelay({
      uploadUrl: "mock://vod-upload",
      headers: {},
      uploadId: `mock-upload-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      mock: true,
      fileName: file.name,
      dramaId,
      episodeId,
    } as UploadSignature);
  },
  async listAuditLogs(query = ""): Promise<PageResult<AuditLog>> {
    const normalized = query.trim().toLowerCase();
    const items = auditLogs.filter((item) =>
      [item.actorName, item.action, item.target, item.requestId]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
    return mockDelay({ items, total: items.length });
  },
  async getCircuitBreaker(): Promise<CircuitBreakerState> {
    return mockDelay(circuitBreaker);
  },
  async setCircuitBreaker(enabled: boolean, reason: string): Promise<CircuitBreakerState> {
    circuitBreaker = {
      enabled,
      reason,
      updatedAt: new Date().toISOString(),
      updatedBy: "陈管理员",
    };
    writeAudit(enabled ? "开启熔断" : "关闭熔断", "全站播放", reason);
    return mockDelay(circuitBreaker);
  },
  async compensate(input: CompensationInput): Promise<void> {
    writeAudit("补偿权益", `用户 ${input.userId}`, `剧目 ${input.dramaId}，${input.seconds} 秒；${input.reason}`);
    return mockDelay(undefined);
  },
  async adjustEntitlement(input: AdjustmentInput): Promise<void> {
    writeAudit(
      "权益纠错",
      `grant ${input.grantId}`,
      `${input.type} ${input.seconds} 秒；${input.reason}`,
    );
    return mockDelay(undefined);
  },
  async replayCallback(input: CallbackReplayInput): Promise<void> {
    writeAudit(
      "回调重放",
      `事件 ${input.eventId}`,
      `${input.reason}${input.approvalNote ? `；${input.approvalNote}` : ""}`,
    );
    return mockDelay(undefined);
  },
  async listCallbackEvents(status = "BACKLOG"): Promise<PageResult<AdminCallbackEvent>> {
    const items: AdminCallbackEvent[] = [
      {
        eventId: "vod-dead-letter-1",
        provider: "VOD",
        eventType: "MEDIA_UPDATED",
        status: "DEAD_LETTER",
        attempts: 5,
        receivedAt: isoHoursAgo(6),
        processedAt: null,
        processingUntil: null,
        outcome: "RETRYABLE_FAILURE",
        payloadAvailable: true,
        replayable: true,
      },
      {
        eventId: "wechat-retry-1",
        provider: "WECHAT",
        eventType: "REWARD_COMPLETED",
        status: "RETRYABLE_FAILURE",
        attempts: 2,
        receivedAt: isoHoursAgo(1),
        processedAt: null,
        processingUntil: null,
        outcome: "RETRYABLE_FAILURE",
        payloadAvailable: false,
        replayable: true,
      },
    ];
    const filtered =
      !status || status === "BACKLOG"
        ? items
        : items.filter((item) => item.status === status);
    return mockDelay({ items: filtered, total: filtered.length });
  },
  async reissueDeletionQueryToken(
    input: DeletionQueryTokenReissueInput,
  ): Promise<ReissueDeletionQueryTokenResponse> {
    writeAudit(
      "注销查询令牌补发",
      `申请 ${input.deletionRequestId}`,
      `核验用户 ${input.userId}；${input.reason}；${input.approvalNote}`,
    );
    return mockDelay({
      deletionRequestId: input.deletionRequestId,
      status: DeletionRequestStatus.PENDING,
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      replayed: false,
    });
  },
};
