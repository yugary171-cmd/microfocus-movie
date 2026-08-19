import type {
  AdminAccountSensitiveActionRequest,
  AdminAccountStatus as ContractAdminAccountStatus,
  AdminAccountView,
  AdminSetupInspectResponse,
  AdminSetupLinkResponse,
  AdminSetupPurpose as ContractAdminSetupPurpose,
  AdminRole,
  CreateAdminAccountRequest,
  CreateAdminSetupLinkRequest,
  DramaStatus,
  MediaStatus,
  ReleaseGateStatus,
  UpdateAdminAccountRequest,
} from "@microfocus/contracts";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

export interface AdminSession {
  accessToken: string;
  user: AdminUser;
}

export type AdminAccountStatus = ContractAdminAccountStatus;
export type AdminSetupPurpose = ContractAdminSetupPurpose;
export type AdminAccountRecord = AdminAccountView;
export type AdminSetupLink = AdminSetupLinkResponse;
export type AdminAccountSetupInfo = AdminSetupInspectResponse;
export type CreateAdminAccountInput = CreateAdminAccountRequest;
export type UpdateAdminAccountInput = UpdateAdminAccountRequest;
export type SuspendAdminAccountInput = AdminAccountSensitiveActionRequest;
export type ActivateAdminAccountInput = AdminAccountSensitiveActionRequest;
export type CreateAdminSetupLinkInput = CreateAdminSetupLinkRequest;

export interface EpisodeRecord {
  id: string;
  episodeNumber: number;
  title: string;
  durationSeconds: number;
  mediaStatus: MediaStatus;
  transcodeStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  machineReviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  manualReviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  wechatReviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  vodFileId?: string;
  updatedAt: string;
}

export interface DramaRecord {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  coverUrl: string;
  status: DramaStatus;
  ownerId: string;
  ownerName: string;
  rightsHolder: string;
  licenseNumber: string;
  rightsValidFrom: string;
  licenseExpiresAt: string;
  rightsReportNumber: string;
  rightsMaterialObjectKey: string;
  rightsMaterialDigestSha256: string;
  allowsWechatDistribution: boolean;
  allowsAdMonetization: boolean;
  allowsTranscoding: boolean;
  allowsPromotionalMaterial: boolean;
  contentApproved: boolean;
  copyrightVerified: boolean;
  wechatApproved: boolean;
  episodes: EpisodeRecord[];
  updatedAt: string;
}

export interface DramaInput {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  coverUrl: string;
  rightsHolder: string;
  licenseNumber: string;
  rightsValidFrom: string;
  licenseExpiresAt: string;
  rightsReportNumber: string;
  rightsMaterialObjectKey: string;
  rightsMaterialDigestSha256: string;
  allowsWechatDistribution: boolean;
  allowsAdMonetization: boolean;
  allowsTranscoding: boolean;
  allowsPromotionalMaterial: boolean;
  episodes: Array<Pick<EpisodeRecord, "id" | "episodeNumber" | "title" | "durationSeconds" | "mediaStatus">>;
}

export interface DashboardCallbackOps {
  deadLetterCount: number;
  retryableCount: number;
  oldestUnprocessedAgeSeconds: number | null;
  openProviderCircuits: string[];
}

export interface DashboardLedgerOps {
  mismatchCount: number;
  mismatchedSeconds: number;
  missingGrants: number;
  lastReconciledAt: string | null;
  ledgerCircuitOpen: boolean;
}

export interface DashboardData {
  releaseGate: ReleaseGateStatus;
  statusCounts: Partial<Record<DramaStatus, number>>;
  reviewBacklog: number;
  metricSourceConfigured: boolean;
  callbackOps: DashboardCallbackOps;
  ledgerOps: DashboardLedgerOps;
}

export interface ReviewItem {
  id: string;
  dramaId: string;
  dramaTitle: string;
  submitterId: string;
  submitterName: string;
  submittedAt: string;
  riskFlags: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface UploadSignature {
  uploadUrl: string;
  headers: Record<string, string>;
  uploadId: string;
  expiresAt: string;
  mock: boolean;
}

export interface UploadProgress {
  state: "idle" | "signing" | "uploading" | "confirming" | "success" | "error";
  progress: number;
  error: string;
  file?: File;
}

export interface CircuitBreakerState {
  enabled: boolean;
  reason: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CompensationInput {
  userId: string;
  dramaId: string;
  seconds: number;
  reason: string;
}

export interface AdjustmentInput {
  type: "FREEZE_REMAINDER" | "RELEASE_FREEZE" | "WRITE_OFF";
  grantId: string;
  seconds: number;
  reason: string;
  freezeAdjustmentId?: string;
  approvalNote?: string;
}

export interface CallbackReplayInput {
  eventId: string;
  reason: string;
  approvalNote?: string;
}

export interface AdminCallbackEvent {
  eventId: string;
  provider: string;
  eventType: string;
  status: string;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
  processingUntil: string | null;
  outcome: string | null;
  payloadAvailable: boolean;
  replayable: boolean;
}

export interface DeletionQueryTokenReissueInput {
  deletionRequestId: string;
  userId: string;
  reason: string;
  approvalNote: string;
}

export interface AuditLog {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: AdminRole | null;
  action: string;
  target: string;
  result: "SUCCESS" | "DENIED" | "FAILED" | "UNKNOWN";
  requestId: string;
  detail: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
}
