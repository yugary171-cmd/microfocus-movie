import { API_ROUTES } from "@microfocus/contracts";
import type { DashboardData } from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeDashboard } from "../normalizers";

const endpoints = API_ROUTES.admin;

export const dashboardApi = {
  async dashboard(): Promise<DashboardData> {
    if (isMockMode) return mockApi.dashboard();
    const [dashboard, gate] = await Promise.all([
      request<unknown>(endpoints.dashboard),
      request<unknown>(endpoints.releaseGate),
    ]);
    return normalizeDashboard(dashboard, gate);
  },
};
