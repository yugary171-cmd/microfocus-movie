import { adminApi } from "@/infrastructure/api/admin";

export const dashboardApi = {
  dashboard: adminApi.dashboard,
} as const;
