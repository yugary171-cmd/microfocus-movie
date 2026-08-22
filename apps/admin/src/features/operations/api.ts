import { adminApi } from "@/infrastructure/api/admin";

export const operationsApi = {
  mode: adminApi.mode,
  listCallbackEvents: adminApi.listCallbackEvents,
  getCircuitBreaker: adminApi.getCircuitBreaker,
  setCircuitBreaker: adminApi.setCircuitBreaker,
  compensate: adminApi.compensate,
  adjustEntitlement: adminApi.adjustEntitlement,
  replayCallback: adminApi.replayCallback,
  reissueDeletionQueryToken: adminApi.reissueDeletionQueryToken,
} as const;
