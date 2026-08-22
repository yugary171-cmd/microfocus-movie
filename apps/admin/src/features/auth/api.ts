import { adminApi } from "@/infrastructure/api/admin";

export const authApi = {
  mode: adminApi.mode,
  hasSession: adminApi.hasSession,
  login: adminApi.login,
  refresh: adminApi.refresh,
  logout: adminApi.logout,
  inspectAccountSetup: adminApi.inspectAccountSetup,
  completeAccountSetup: adminApi.completeAccountSetup,
} as const;
