import {
  AdminAccountStatus,
  AdminRole
} from "@microfocus/contracts";
import type {
  AdminSession,
  AdminAccountSetupInfo
} from "@/shared/types";




import {
  state
} from "../state";
import {
  persistAdminAccounts,
  persistSetupLinks
} from "../storage";
import {
  findAccount,
  mockDelay,
  validMockSetupLink,
  writeAudit
} from "../helpers";

export const authMockApi = {
  async login(email: string, _otp: string, role: AdminRole): Promise<AdminSession> {
    const storedAccount = state.adminAccounts.find(
      (account) => account.email === email.trim().toLowerCase(),
    );
    if (storedAccount && storedAccount.status !== AdminAccountStatus.ACTIVE) {
      throw new Error("该演示账号尚未开通或已停用");
    }
    if (storedAccount) {
      storedAccount.lastLoginAt = new Date().toISOString();
      persistAdminAccounts(state);
    }
    return mockDelay({
      accessToken: `mock-session-${crypto.randomUUID()}`,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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
  async inspectAccountSetup(token: string): Promise<AdminAccountSetupInfo> {
    const link = validMockSetupLink(state, token);
    const account = findAccount(state, link.accountId);
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
    const link = validMockSetupLink(state, token);
    if (password.length < 12 || password.length > 128) throw new Error("密码长度应为 12–128 位");
    if (!/^\d{6}$/.test(otp)) throw new Error("请输入验证器中的 6 位验证码");
    const account = findAccount(state, link.accountId);
    account.status = AdminAccountStatus.ACTIVE;
    account.setupCompletedAt = new Date().toISOString();
    account.totpEnabled = true;
    account.updatedAt = new Date().toISOString();
    link.usedAt = new Date().toISOString();
    persistAdminAccounts(state);
    persistSetupLinks(state);
    writeAudit(state, "管理员完成账号开通", account.email, "本人设置密码并绑定 TOTP；演示模式未保存凭据");
    return mockDelay(undefined);
  },
};
