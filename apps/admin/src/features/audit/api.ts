import { adminApi } from "@/infrastructure/api/admin";

export const auditApi = {
  listAuditLogs: adminApi.listAuditLogs,
} as const;
