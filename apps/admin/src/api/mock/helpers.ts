import {
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  CATALOG_TAG_GROUPS,
  catalogTagNamesById,
  isOwnedContentRole,
  isRightsMaterialDigest,
  MediaStatus
} from "@microfocus/contracts";
import type {
  AdminAccountRecord,
  AdminSetupLink,
  DramaRecord,
  PageResult
} from "@/shared/types";
import {
  isRightsActive
} from "@/policies/admin";
import type {
  MockSetupLinkRecord,
  MockState
} from "./state";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export async function mockDelay<T>(value: T, delay = 160): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, delay));
  return clone(value);
}

export function paginate<T>(items: T[], page = 1, pageSize = ADMIN_LIST_PAGE_SIZE): PageResult<T> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  if (safePage > ADMIN_LIST_MAX_PAGE) return { items: [], total: 0 };
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length };
}

export function writeAudit(state: MockState, action: string, target: string, detail: string): void {
  state.auditLogs.unshift({
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

export function requireMockOtp(otp: string): void {
  if (!/^\d{6}$/.test(otp)) throw new Error("请输入当前管理员的 6 位验证码");
}

export function accountOwnedDramaCount(state: MockState, accountId: string): number {
  return state.dramas.filter((drama) => drama.ownerId === accountId).length;
}

export function refreshOwnedDramaCounts(state: MockState): void {
  state.adminAccounts = state.adminAccounts.map((account) => ({
    ...account,
    ownedDramaCount: accountOwnedDramaCount(state, account.id),
  }));
}

export function findAccount(state: MockState, id: string): AdminAccountRecord {
  const account = state.adminAccounts.find((item) => item.id === id);
  if (!account) throw new Error("未找到该管理员账号");
  return account;
}

export function assertReplacement(state: MockState, target: AdminAccountRecord, replacementEditorId?: string): void {
  const ownedCount = accountOwnedDramaCount(state, target.id);
  if (!isOwnedContentRole(target.role) || ownedCount === 0) return;
  const replacement = replacementEditorId ? state.adminAccounts.find((item) => item.id === replacementEditorId) : undefined;
  if (!replacement || replacement.id === target.id || replacement.role !== AdminRole.EDITOR || replacement.status !== AdminAccountStatus.ACTIVE) {
    throw new Error(`该内容编辑名下有 ${ownedCount} 部剧目，请选择另一名正常的内容编辑接替`);
  }
  state.dramas = state.dramas.map((drama) => drama.ownerId === target.id
    ? { ...drama, ownerId: replacement.id, ownerName: replacement.displayName }
    : drama);
}

export function assertLastAdmin(state: MockState, target: AdminAccountRecord, nextRole = target.role, nextStatus = target.status): void {
  if (target.role !== AdminRole.ADMIN || target.status !== AdminAccountStatus.ACTIVE) return;
  if (nextRole === AdminRole.ADMIN && nextStatus === AdminAccountStatus.ACTIVE) return;
  const otherActiveAdmins = state.adminAccounts.filter(
    (item) => item.id !== target.id && item.role === AdminRole.ADMIN && item.status === AdminAccountStatus.ACTIVE,
  );
  if (otherActiveAdmins.length === 0) throw new Error("必须至少保留一个正常的系统管理员");
}

export function issueMockSetupLink(state: MockState, accountId: string, purpose: AdminSetupPurpose): AdminSetupLink {
  const nowIso = new Date().toISOString();
  state.mockSetupLinks = state.mockSetupLinks.map((link) =>
    link.accountId === accountId && !link.usedAt ? { ...link, usedAt: nowIso } : link,
  );
  const token = `mock-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  state.mockSetupLinks.unshift({ token, accountId, purpose, expiresAt, usedAt: null });
  return {
    account: findAccount(state, accountId),
    setupToken: token,
    setupUrl: `${window.location.origin}/account-setup#token=${encodeURIComponent(token)}`,
    expiresAt,
    purpose,
  };
}

export function validMockSetupLink(state: MockState, token: string): MockSetupLinkRecord {
  const link = state.mockSetupLinks.find((item) => item.token === token);
  if (!link || link.usedAt || new Date(link.expiresAt).getTime() <= Date.now()) {
    throw new Error("开通链接无效、已过期或已被使用");
  }
  return link;
}

export function dramaTagIds(_state: MockState, drama: { tagIds?: string[] | undefined }): string[] {
  return Array.isArray(drama.tagIds) ? drama.tagIds.filter((id) => typeof id === "string" && id) : [];
}

export function catalogTagIdForName(state: MockState, name: string): string | undefined {
  const matches = state.catalogTags.filter((tag) => tag.name === name);
  if (matches.length === 1) return matches[0]?.id;
  for (const group of CATALOG_TAG_GROUPS) {
    const hit = matches.find((tag) => tag.group === group.id);
    if (hit) return hit.id;
  }
  return undefined;
}

export function backfillDramaTagIds(drama: DramaRecord, state: MockState): DramaRecord {
  const raw = [...dramaTagIds(state, drama), ...(Array.isArray(drama.tags) ? drama.tags : [])];
  const tagIds: string[] = [];
  for (const value of raw) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const id = state.catalogTags.some((tag) => tag.id === trimmed) ? trimmed : catalogTagIdForName(state, trimmed);
    if (id && !tagIds.includes(id)) tagIds.push(id);
  }
  return { ...drama, tagIds, tags: catalogTagNamesById(tagIds, state.catalogTags) };
}

export function dramaUsesCatalogTag(state: MockState, drama: { tagIds?: string[] | undefined; tags?: string[] | undefined }, tagId: string): boolean {
  if (dramaTagIds(state, drama).includes(tagId)) return true;
  const tag = state.catalogTags.find((item) => item.id === tagId);
  const names = Array.isArray(drama.tags) ? drama.tags : [];
  return Boolean(tag && names.includes(tag.name));
}

export function assertMockRights(drama: DramaRecord): void {
  const hasRightsMaterial = Boolean(
    drama.rightsHolder.trim() && drama.licenseNumber.trim() && drama.rightsValidFrom && drama.licenseExpiresAt &&
    isRightsActive(drama.rightsValidFrom, drama.licenseExpiresAt) && drama.rightsReportNumber.trim() &&
    drama.rightsMaterialObjectKey.trim() && isRightsMaterialDigest(drama.rightsMaterialDigestSha256),
  );
  if (!hasRightsMaterial || !drama.allowsWechatDistribution || !drama.allowsAdMonetization || !drama.allowsTranscoding || !drama.allowsPromotionalMaterial) {
    throw new Error("Mock 发布前请补齐版权资料并确认全部授权范围");
  }
}

export function assertMockEpisodesReady(drama: DramaRecord): void {
  if (drama.episodes.length === 0 || drama.episodes.some((episode) =>
    episode.mediaStatus !== MediaStatus.READY || episode.transcodeStatus !== "READY" ||
    episode.machineReviewStatus !== "APPROVED" || episode.manualReviewStatus !== "APPROVED" || episode.wechatReviewStatus !== "APPROVED"
  )) {
    throw new Error("Mock 发布前请完成所有剧集的处理与审核");
  }
}
