import { API_ROUTES, type AdminRole } from "@microfocus/contracts";
import type {
  AdminSession,
  AdminAccountSetupInfo,
} from "@/shared/types";
import { getSessionToken, isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeAdminAccountSetupInfo, normalizeAdminSession } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const authApi = {
  hasSession: () => Boolean(getSessionToken()),
  async login(email: string, password: string, otp: string, mockRole: AdminRole): Promise<AdminSession> {
    if (isMockMode) return mockApi.login(email, otp, mockRole);
    const response = await request<unknown>(endpoints.login, {
      method: "POST",
      body: json({ email, password, otp }),
    });
    return normalizeAdminSession(response);
  },
  async refresh(): Promise<AdminSession> {
    if (isMockMode) throw new Error("Mock 模式不支持跨标签页会话恢复");
    return normalizeAdminSession(await request<unknown>(endpoints.refresh, {
      method: "POST",
    }, { skipAuthRefresh: true }));
  },
  async logout(): Promise<void> {
    if (isMockMode) return;
    await request<unknown>(endpoints.logout, {
      method: "POST",
    }, { skipAuthRefresh: true });
  },
  async inspectAccountSetup(token: string): Promise<AdminAccountSetupInfo> {
    if (isMockMode) return mockApi.inspectAccountSetup(token);
    return normalizeAdminAccountSetupInfo(await request<unknown>(endpoints.setupInspect, {
      method: "POST",
      body: json({ token }),
    }));
  },
  async completeAccountSetup(token: string, password: string, otp: string): Promise<void> {
    if (isMockMode) return mockApi.completeAccountSetup(token, password, otp);
    await request(endpoints.setupComplete, {
      method: "POST",
      body: json({ token, password, otp }),
    });
  },
};
