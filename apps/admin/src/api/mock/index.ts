import { accountsMockApi } from "./domains/accounts";
import { auditMockApi } from "./domains/audit";
import { authMockApi } from "./domains/auth";
import { dashboardMockApi } from "./domains/dashboard";
import { dramasMockApi } from "./domains/dramas";
import { feedbackMockApi } from "./domains/feedback";
import { notificationsMockApi } from "./domains/notifications";
import { operationsMockApi } from "./domains/operations";
import { reviewsMockApi } from "./domains/reviews";
import { tagsMockApi } from "./domains/tags";

export const mockApi = {
  ...authMockApi,
  ...accountsMockApi,
  ...dashboardMockApi,
  ...tagsMockApi,
  ...dramasMockApi,
  ...reviewsMockApi,
  ...auditMockApi,
  ...notificationsMockApi,
  ...feedbackMockApi,
  ...operationsMockApi,
};

