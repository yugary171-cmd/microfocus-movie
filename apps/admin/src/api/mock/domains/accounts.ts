import {
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  ADMIN_WEB_PAGE_SIZE,
  isAdminLoginId,
  isAssignableAdminRole,
  isOwnedContentRole,
  normalizeAdminWebPageSize
} from "@microfocus/contracts";
import type {
  PageResult,
  AdminAccountRecord,
  AdminSetupLink,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
  SuspendAdminAccountInput,
  ActivateAdminAccountInput,
  CreateAdminSetupLinkInput
} from "@/shared/types";



import {
  MOCK_CURRENT_ADMIN_ID
} from "../fixtures";
import {
  state
} from "../state";
import {
  persistAdminAccounts,
  persistSetupLinks
} from "../storage";
import {
  assertLastAdmin,
  assertReplacement,
  findAccount,
  issueMockSetupLink,
  mockDelay,
  paginate,
  refreshOwnedDramaCounts,
  requireMockOtp,
  writeAudit
} from "../helpers";

export const accountsMockApi = {
  async listAccounts(
    query = "",
    role: AdminRole | "" = "",
    status: AdminAccountStatus | "" = "",
    page = 1,
    pageSize = ADMIN_WEB_PAGE_SIZE,
  ): Promise<PageResult<AdminAccountRecord>> {
    refreshOwnedDramaCounts(state, );
    const normalized = query.trim().toLowerCase();
    const items = state.adminAccounts
      .filter((account) =>
        (!normalized || `${account.displayName} ${account.email}`.toLowerCase().includes(normalized)) &&
        (!role || account.role === role) &&
        (!status || account.status === status),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return mockDelay(paginate(items, page, normalizeAdminWebPageSize(pageSize)));
  },
  async createAccount(input: CreateAdminAccountInput): Promise<AdminSetupLink> {
    requireMockOtp(input.otp);
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    if (!displayName || !email) throw new Error("姓名和邮箱不能为空");
    if (!isAssignableAdminRole(input.role)) throw new Error("新建账号只能是内容编辑或系统管理员");
    if (!isAdminLoginId(email)) throw new Error("登录名格式无效");
    if (state.adminAccounts.some((account) => account.email === email)) throw new Error("该登录名已存在");
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
    state.adminAccounts.unshift(account);
    persistAdminAccounts(state);
    writeAudit(state, "创建管理员账号", account.email, `角色 ${account.role}；等待本人完成开通`);
    return mockDelay(issueMockSetupLink(state, account.id, AdminSetupPurpose.INVITE));
  },
  async updateAccount(id: string, input: UpdateAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    const account = findAccount(state, id);
    const nextRole = input.role ?? account.role;
    if (input.role !== undefined && !isAssignableAdminRole(input.role)) {
      throw new Error("只能改为内容编辑或系统管理员");
    }
    if (id === MOCK_CURRENT_ADMIN_ID && nextRole !== account.role) throw new Error("不能修改自己的角色");
    assertLastAdmin(state, account, nextRole, account.status);
    if (isOwnedContentRole(account.role) && !isOwnedContentRole(nextRole)) {
      assertReplacement(state, account, input.transferEditorId);
    }
    account.displayName = input.displayName?.trim() || account.displayName;
    account.role = nextRole;
    account.updatedAt = new Date().toISOString();
    refreshOwnedDramaCounts(state, );
    persistAdminAccounts(state);
    writeAudit(state, "修改管理员账号", account.email, `姓名 ${account.displayName}；角色 ${account.role}`);
    return mockDelay(findAccount(state, account.id));
  },
  async suspendAccount(id: string, input: SuspendAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    if (id === MOCK_CURRENT_ADMIN_ID) throw new Error("不能停用自己的账号");
    const account = findAccount(state, id);
    assertLastAdmin(state, account, account.role, AdminAccountStatus.SUSPENDED);
    assertReplacement(state, account, input.transferEditorId);
    account.status = AdminAccountStatus.SUSPENDED;
    account.updatedAt = new Date().toISOString();
    refreshOwnedDramaCounts(state, );
    persistAdminAccounts(state);
    writeAudit(state, "停用管理员账号", account.email, input.reason.trim());
    return mockDelay(findAccount(state, account.id));
  },
  async activateAccount(id: string, input: ActivateAdminAccountInput): Promise<AdminAccountRecord> {
    requireMockOtp(input.otp);
    const account = findAccount(state, id);
    if (account.status === AdminAccountStatus.PENDING_SETUP) throw new Error("待开通账号必须先完成开通，不能直接启用");
    account.status = AdminAccountStatus.ACTIVE;
    account.updatedAt = new Date().toISOString();
    persistAdminAccounts(state);
    writeAudit(state, "启用管理员账号", account.email, input.reason.trim());
    return mockDelay(account);
  },
  async createAccountSetupLink(id: string, input: CreateAdminSetupLinkInput): Promise<AdminSetupLink> {
    requireMockOtp(input.otp);
    const account = findAccount(state, id);
    if (input.purpose === AdminSetupPurpose.CREDENTIAL_RESET) {
      if (id === MOCK_CURRENT_ADMIN_ID) throw new Error("不能重置自己的登录凭据");
      assertLastAdmin(state, account, account.role, AdminAccountStatus.SUSPENDED);
      assertReplacement(state, account, input.transferEditorId);
      account.status = AdminAccountStatus.PENDING_SETUP;
      account.setupCompletedAt = null;
      account.totpEnabled = false;
      account.updatedAt = new Date().toISOString();
      persistAdminAccounts(state);
      writeAudit(state, "重置管理员登录凭据", account.email, input.reason.trim());
    } else {
      if (account.status !== AdminAccountStatus.PENDING_SETUP) throw new Error("只有待开通账号可以重发开通链接");
      writeAudit(state, "重发管理员开通链接", account.email, input.reason.trim());
    }
    const link = issueMockSetupLink(state, account.id, input.purpose);
    persistSetupLinks(state);
    return mockDelay(link);
  },
};
