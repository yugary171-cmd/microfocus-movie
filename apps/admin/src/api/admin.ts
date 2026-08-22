import { apiBaseUrl, isMockMode } from "./client";
import { accountsApi } from "./domains/accounts";
import { auditApi } from "./domains/audit";
import { authApi } from "./domains/auth";
import { dashboardApi } from "./domains/dashboard";
import { dramasApi } from "./domains/dramas";
import { feedbackApi } from "./domains/feedback";
import { notificationsApi } from "./domains/notifications";
import { operationsApi } from "./domains/operations";
import { reviewsApi } from "./domains/reviews";
import { tagsApi } from "./domains/tags";

export const adminApi = {
  mode: isMockMode ? "mock" : "live",
  baseUrl: apiBaseUrl,
  ...authApi,
  ...dashboardApi,
  ...accountsApi,
  ...dramasApi,
  ...reviewsApi,
  ...tagsApi,
  ...notificationsApi,
  ...feedbackApi,
  ...auditApi,
  ...operationsApi,
} as const;
