import {
  AdminSetupPurpose,
  type CatalogTag,
  type ReleaseGateStatus
} from "@microfocus/contracts";
import type {
  AuditLog,
  CircuitBreakerState,
  DramaRecord,
  AdminAccountRecord,
  ReviewItem,
  AdminNotificationRecord,
  AdminFeedbackRecord
} from "@/shared/types";



import {
  defaultAccounts,
  defaultAuditLogs,
  defaultCircuitBreaker,
  defaultDramas,
  defaultFeedback,
  defaultNotifications,
  defaultReviews,
  releaseGate,
  seedMockCatalogTags
} from "./fixtures";
import {
  MOCK_ACCOUNTS_KEY,
  MOCK_SETUP_LINKS_KEY,
  readStoredList,
  restoreMockContent,
  restoreMockTags
} from "./storage";

export interface MockSetupLinkRecord {
  token: string;
  accountId: string;
  purpose: AdminSetupPurpose;
  expiresAt: string;
  usedAt: string | null;
}

export interface MockState {
  adminAccounts: AdminAccountRecord[];
  mockSetupLinks: MockSetupLinkRecord[];
  releaseGate: ReleaseGateStatus;
  dramas: DramaRecord[];
  reviews: ReviewItem[];
  catalogTags: CatalogTag[];
  auditLogs: AuditLog[];
  mockNotifications: AdminNotificationRecord[];
  mockFeedback: AdminFeedbackRecord[];
  circuitBreaker: CircuitBreakerState;
}

export const state: MockState = {
  adminAccounts: readStoredList(MOCK_ACCOUNTS_KEY, defaultAccounts()),
  mockSetupLinks: readStoredList<MockSetupLinkRecord>(MOCK_SETUP_LINKS_KEY, []),
  releaseGate,
  dramas: defaultDramas,
  reviews: defaultReviews,
  catalogTags: seedMockCatalogTags(),
  auditLogs: defaultAuditLogs,
  mockNotifications: defaultNotifications,
  mockFeedback: defaultFeedback,
  circuitBreaker: defaultCircuitBreaker,
};

restoreMockTags(state, seedMockCatalogTags());
restoreMockContent(state);
