import {
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  CALLBACK_MAX_ATTEMPTS,
  DeletionRequestStatus,
  DELETION_QUERY_TOKEN_TTL_SECONDS,
  DramaStatus,
  isRightsMaterialDigest,
  MediaStatus,
  RIGHTS_MATERIAL_DIGEST_LENGTH,
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
  AdminAccountRecord,
  AdminAccountSetupInfo,
  AdminSetupLink,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
  SuspendAdminAccountInput,
  ActivateAdminAccountInput,
  CreateAdminSetupLinkInput,
  ReviewItem,
  UploadSignature,
} from "@/types/admin";
import { isRightsActive } from "@/policies/admin";
import { dramaDraftError } from "@/policies/drama-input";

const now = new Date();
const isoHoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const MOCK_ACCOUNTS_KEY = "microfocus.admin.mock-accounts-v1";
const MOCK_SETUP_LINKS_KEY = "microfocus.admin.mock-setup-links-v1";
const MOCK_CURRENT_ADMIN_ID = "admin-1";

interface MockSetupLinkRecord {
  token: string;
  accountId: string;
  purpose: AdminSetupPurpose;
  expiresAt: string;
  usedAt: string | null;
}

const defaultAccounts = (): AdminAccountRecord[] => [
  {
    id: MOCK_CURRENT_ADMIN_ID,
    displayName: "陈管理员",
    email: "admin@example.com",
    role: AdminRole.ADMIN,
    status: AdminAccountStatus.ACTIVE,
    totpEnabled: true,
    ownedDramaCount: 0,
    setupCompletedAt: isoHoursAgo(24 * 80),
    lastLoginAt: isoHoursAgo(1),
    createdAt: isoHoursAgo(24 * 80),
    updatedAt: isoHoursAgo(1),
  },
  {
    id: "editor-1",
    displayName: "林编辑",
    email: "editor@example.com",
    role: AdminRole.EDITOR,
    status: AdminAccountStatus.ACTIVE,
    totpEnabled: true,
    ownedDramaCount: 2,
    setupCompletedAt: isoHoursAgo(24 * 40),
    lastLoginAt: isoHoursAgo(8),
    createdAt: isoHoursAgo(24 * 40),
    updatedAt: isoHoursAgo(8),
  },
  {
    id: "editor-2",
    displayName: "许编辑",
    email: "editor2@example.com",
    role: AdminRole.EDITOR,
    status: AdminAccountStatus.ACTIVE,
    totpEnabled: true,
    ownedDramaCount: 1,
    setupCompletedAt: isoHoursAgo(24 * 25),
    lastLoginAt: isoHoursAgo(20),
    createdAt: isoHoursAgo(24 * 25),
    updatedAt: isoHoursAgo(20),
  },
  {
    id: "reviewer-1",
    displayName: "周审核",
    email: "reviewer@example.com",
    role: AdminRole.REVIEWER,
    status: AdminAccountStatus.ACTIVE,
    totpEnabled: true,
    ownedDramaCount: 0,
    setupCompletedAt: isoHoursAgo(24 * 30),
    lastLoginAt: isoHoursAgo(5),
    createdAt: isoHoursAgo(24 * 30),
    updatedAt: isoHoursAgo(5),
  },
];

function readStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) && value.length > 0 ? value as T[] : fallback;
  } catch {
    return fallback;
  }
}

let adminAccounts = readStoredList(MOCK_ACCOUNTS_KEY, defaultAccounts());
let mockSetupLinks = readStoredList<MockSetupLinkRecord>(MOCK_SETUP_LINKS_KEY, []);

function persistAdminAccounts(): void {
  window.localStorage.setItem(MOCK_ACCOUNTS_KEY, JSON.stringify(adminAccounts));
}

function persistSetupLinks(): void {
  window.localStorage.setItem(MOCK_SETUP_LINKS_KEY, JSON.stringify(mockSetupLinks));
}

function requireMockOtp(otp: string): void {
  if (!/^\d{6}$/.test(otp)) throw new Error("请输入当前管理员的 6 位验证码");
}

function accountOwnedDramaCount(accountId: string): number {
  return dramas.filter((drama) => drama.ownerId === accountId).length;
}

function refreshOwnedDramaCounts(): void {
  adminAccounts = adminAccounts.map((account) => ({
    ...account,
    ownedDramaCount: accountOwnedDramaCount(account.id),
  }));
}

function findAccount(id: string): AdminAccountRecord {
  const account = adminAccounts.find((item) => item.id === id);
  if (!account) throw new Error("未找到该管理员账号");
  return account;
}

function assertReplacement(target: AdminAccountRecord, replacementEditorId?: string): void {
  const ownedCount = accountOwnedDramaCount(target.id);
  if (target.role !== AdminRole.EDITOR || ownedCount === 0) return;
  const replacement = replacementEditorId
    ? adminAccounts.find((item) => item.id === replacementEditorId)
    : undefined;
  if (!replacement || replacement.id === target.id || replacement.role !== AdminRole.EDITOR || replacement.status !== AdminAccountStatus.ACTIVE) {
    throw new Error(`该内容编辑名下有 ${ownedCount} 部剧目，请选择另一名正常的内容编辑接替`);
  }
  dramas = dramas.map((drama) => drama.ownerId === target.id
    ? { ...drama, ownerId: replacement.id, ownerName: replacement.displayName }
    : drama);
}

function assertLastAdmin(target: AdminAccountRecord, nextRole = target.role, nextStatus = target.status): void {
  if (target.role !== AdminRole.ADMIN || target.status !== AdminAccountStatus.ACTIVE) return;
  if (nextRole === AdminRole.ADMIN && nextStatus === AdminAccountStatus.ACTIVE) return;
  const otherActiveAdmins = adminAccounts.filter(
    (item) => item.id !== target.id && item.role === AdminRole.ADMIN && item.status === AdminAccountStatus.ACTIVE,
  );
  if (otherActiveAdmins.length === 0) throw new Error("必须至少保留一个正常的系统管理员");
}

function issueMockSetupLink(accountId: string, purpose: AdminSetupPurpose): AdminSetupLink {
  const nowIso = new Date().toISOString();
  mockSetupLinks = mockSetupLinks.map((link) =>
    link.accountId === accountId && !link.usedAt ? { ...link, usedAt: nowIso } : link,
  );
  const token = `mock-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  mockSetupLinks.unshift({ token, accountId, purpose, expiresAt, usedAt: null });
  persistSetupLinks();
  return {
    account: findAccount(accountId),
    setupToken: token,
    setupUrl: `${window.location.origin}/account-setup#token=${encodeURIComponent(token)}`,
    expiresAt,
    purpose,
  };
}

function validMockSetupLink(token: string): MockSetupLinkRecord {
  const link = mockSetupLinks.find((item) => item.token === token);
  if (!link || link.usedAt || new Date(link.expiresAt).getTime() <= Date.now()) {
    throw new Error("开通链接无效、已过期或已被使用");
  }
  return link;
}

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
    rightsMaterialDigestSha256: "1".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
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
        mediaStatus: MediaStatus.PROCESSING,
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
    rightsMaterialDigestSha256: "2".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
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
    isRightsMaterialDigest(drama.rightsMaterialDigestSha256),
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
    const storedAccount = adminAccounts.find(
      (account) => account.email === email.trim().toLowerCase(),
    );
    if (storedAccount && storedAccount.status !== AdminAccountStatus.ACTIVE) {
      throw new Error("该演示账号尚未开通或已停用");
    }
    if (storedAccount) {
      storedAccount.lastLoginAt = new Date().toISOString();
      persistAdminAccounts();
    }
    return mockDelay({
      accessToken: `mock-session-${crypto.randomUUID()}`,
      user: storedAccount
        ? {
            id: storedAccount.id,
            name: storedAccount.displayName,
            email: storedAccount.email,
            role: storedAccount.role,
          }
        : {
            id: role === AdminRole.EDITOR ? "editor-1" : `${role.toLowerCase()}-1`,
            name: role === AdminRole.EDITOR ? "林编辑" : role === AdminRole.REVIEWER ? "周审核" : "陈管理员",
            email,
            role,
          },
    });
  },
  async listAccounts(
    query = "",
    role: AdminRole | "" = "",
    status: AdminAccountStatus | "" = "",
    page = 1,
  ): Promise<PageResult<AdminAccountRecord>> {
    refreshOwnedDramaCounts();
    const normalized = query.trim().toLowerCase();
    const items = adminAccounts
      .filter((account) =>
        (!normalized || `${account.displayName} ${account.email}`.toLowerCase().includes(normalized)) &&
        (!role || account.role === role) &&
        (!status || account.status === status),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return mockDelay(paginate(items, page));
  },
  async createAccount(input: CreateAdminAccountInput): Promise<AdminSetupLink> {
    requireMockOtp(input.otp);
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    if (!displayName || !email) throw new Error("姓名和邮箱不能为空");
    if (adminAccounts.some((account) => account.email === email)) throw new Error("该邮箱已存在");
    const createdAt = new Date().toISOString();
    const account: AdminAccountRecord = {
      id: `admin-account-${crypto.randomUUID()}`,
      displayName,
      email,
      role: input.role,
      status: AdminAccountStatus.PENDING_SETUP,
      totpEnabled: false,
      ownedDramaCount: 0,
      setupCompletedAt: null,
      lastLoginAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    adminAccounts.unshift(account);
    persistAdminAccounts();
    writeAudit("创建管理员账号", account.email, `角色 ${account.role}；等待本人完成开通`);
    return mockDelay(issueMockSetupLink(account.id, AdminSetupPurpose.INVITE));
  },
  async updateAccount(id: string, input: UpdateAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    const account = findAccount(id);
    const nextRole = input.role ?? account.role;
    if (id === MOCK_CURRENT_ADMIN_ID && nextRole !== account.role) throw new Error("不能修改自己的角色");
    assertLastAdmin(account, nextRole, account.status);
    if (account.role === AdminRole.EDITOR && nextRole !== AdminRole.EDITOR) {
      assertReplacement(account, input.transferEditorId);
    }
    account.displayName = input.displayName?.trim() || account.displayName;
    account.role = nextRole;
    account.updatedAt = new Date().toISOString();
    refreshOwnedDramaCounts();
    persistAdminAccounts();
    writeAudit("修改管理员账号", account.email, `姓名 ${account.displayName}；角色 ${account.role}`);
    return mockDelay(findAccount(account.id));
  },
  async suspendAccount(id: string, input: SuspendAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    if (id === MOCK_CURRENT_ADMIN_ID) throw new Error("不能停用自己的账号");
    const account = findAccount(id);
    assertLastAdmin(account, account.role, AdminAccountStatus.SUSPENDED);
    assertReplacement(account, input.transferEditorId);
    account.status = AdminAccountStatus.SUSPENDED;
    account.updatedAt = new Date().toISOString();
    refreshOwnedDramaCounts();
    persistAdminAccounts();
    writeAudit("停用管理员账号", account.email, input.reason.trim());
    return mockDelay(findAccount(account.id));
  },
  async activateAccount(id: string, input: ActivateAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    const account = findAccount(id);
    if (account.status === AdminAccountStatus.PENDING_SETUP) throw new Error("待开通账号必须先完成开通，不能直接启用");
    account.status = AdminAccountStatus.ACTIVE;
    account.updatedAt = new Date().toISOString();
    persistAdminAccounts();
    writeAudit("启用管理员账号", account.email, input.reason.trim());
    return mockDelay(account);
  },
  async createAccountSetupLink(id: string, input: CreateAdminSetupLinkInput): Promise<AdminSetupLink> {
    requireMockOtp(input.otp);
    const account = findAccount(id);
    if (input.purpose === AdminSetupPurpose.CREDENTIAL_RESET) {
      if (id === MOCK_CURRENT_ADMIN_ID) throw new Error("不能重置自己的登录凭据");
      assertLastAdmin(account, account.role, AdminAccountStatus.SUSPENDED);
      assertReplacement(account, input.transferEditorId);
      account.status = AdminAccountStatus.PENDING_SETUP;
      account.setupCompletedAt = null;
      account.totpEnabled = false;
      account.updatedAt = new Date().toISOString();
      persistAdminAccounts();
      writeAudit("重置管理员登录凭据", account.email, input.reason.trim());
    } else {
      if (account.status !== AdminAccountStatus.PENDING_SETUP) throw new Error("只有待开通账号可以重发开通链接");
      writeAudit("重发管理员开通链接", account.email, input.reason.trim());
    }
    return mockDelay(issueMockSetupLink(account.id, input.purpose));
  },
  async inspectAccountSetup(token: string): Promise<AdminAccountSetupInfo> {
    const link = validMockSetupLink(token);
    const account = findAccount(link.accountId);
    const manualKey = `MOCK${account.id.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-20).padEnd(20, "A")}`;
    return mockDelay({
      displayName: account.displayName,
      email: account.email,
      role: account.role,
      purpose: link.purpose,
      otpauthUri: `otpauth://totp/${encodeURIComponent(`微焦:${account.email}`)}?secret=${manualKey}&issuer=${encodeURIComponent("微焦短剧管理台")}`,
      manualKey,
      expiresAt: link.expiresAt,
    });
  },
  async completeAccountSetup(token: string, password: string, otp: string): Promise<void> {
    const link = validMockSetupLink(token);
    if (password.length < 12 || password.length > 128) throw new Error("密码长度应为 12–128 位");
    if (!/^\d{6}$/.test(otp)) throw new Error("请输入验证器中的 6 位验证码");
    const account = findAccount(link.accountId);
    account.status = AdminAccountStatus.ACTIVE;
    account.setupCompletedAt = new Date().toISOString();
    account.totpEnabled = true;
    account.updatedAt = new Date().toISOString();
    link.usedAt = new Date().toISOString();
    persistAdminAccounts();
    persistSetupLinks();
    writeAudit("管理员完成账号开通", account.email, "本人设置密码并绑定 TOTP；演示模式未保存凭据");
    return mockDelay(undefined);
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
    const validation = dramaDraftError(input);
    if (validation) throw new Error(validation);
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
    writeAudit("签发上传签名", dramaId, `剧集 ${episodeId}`);
    return mockDelay({
      uploadUrl: "mock://vod-upload",
      headers: {},
      uploadId: `mock-upload-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      mock: true,
      fileName: file.name.trim(),
      dramaId,
      episodeId,
    } as UploadSignature);
  },
  async listAuditLogs(query = "", page = 1): Promise<PageResult<AuditLog>> {
    const normalized = query.trim().toLowerCase();
    const items = auditLogs.filter((item) =>
      [item.actorName, item.action, item.target, item.requestId]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
    return mockDelay(paginate(items, page));
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
        attempts: CALLBACK_MAX_ATTEMPTS,
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
      tokenExpiresAt: new Date(Date.now() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000).toISOString(),
      replayed: false,
    });
  },
};
