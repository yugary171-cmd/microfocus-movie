export const FREE_EPISODE_COUNT = 2;
export const REWARD_SECONDS = 600;
export const REWARD_TTL_SECONDS = 24 * 60 * 60;
export const HEARTBEAT_INTERVAL_SECONDS = 5;
export const OFFLINE_GRACE_SECONDS = 15;
export const PLAYBACK_TOKEN_TTL_SECONDS = 120;
export const ANONYMOUS_VIEWER_TTL_SECONDS = 30 * 60;
export const PLAYBACK_WINDOW_SECONDS = HEARTBEAT_INTERVAL_SECONDS;
export const UNCONFIRMED_EXPOSURE_LIMIT = 3;
export const PLAYBACK_RECOVERY_GRACE_LIMIT = 3;
export const DELETION_QUERY_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const DELETION_CONFIRMATION = "DELETE_MY_ACCOUNT";
export const CALLBACK_MAX_ATTEMPTS = 5;

export const ERROR_CODES = {
  ANONYMOUS_SESSION_EXPIRED: "ANONYMOUS_SESSION_EXPIRED",
  USER_TOKEN_REQUIRED: "USER_TOKEN_REQUIRED",
  UNCONFIRMED_EXPOSURE_LIMIT: "UNCONFIRMED_EXPOSURE_LIMIT",
  CUSTOMER_SERVICE_REQUIRED: "CUSTOMER_SERVICE_REQUIRED",
  ADJUSTMENT_EXCEEDS_AVAILABLE: "ADJUSTMENT_EXCEEDS_AVAILABLE",
  ADJUSTMENT_RELEASE_EXCEEDS_FREEZE: "ADJUSTMENT_RELEASE_EXCEEDS_FREEZE",
  ADJUSTMENT_INVALID_SOURCE: "ADJUSTMENT_INVALID_SOURCE",
  ACCOUNT_UNAVAILABLE: "ACCOUNT_UNAVAILABLE",
  DELETION_TOKEN_INVALID: "DELETION_TOKEN_INVALID",
  CALLBACK_NOT_REPLAYABLE: "CALLBACK_NOT_REPLAYABLE",
  CALLBACK_DEAD_LETTER: "CALLBACK_DEAD_LETTER"
} as const;

export const API_ROUTES = {
  auth: {
    wechat: "/v1/auth/wechat",
    anonymous: "/v1/auth/anonymous"
  },
  catalog: "/v1/catalog",
  search: "/v1/search",
  drama: (dramaId: string) => `/v1/dramas/${dramaId}`,
  history: "/v1/me/history",
  progress: "/v1/me/progress",
  entitlement: (dramaId: string) => `/v1/entitlements/${dramaId}`,
  deletionRequests: "/v1/me/deletion-requests",
  deletionRequest: (deletionRequestId: string) =>
    `/v1/me/deletion-requests/${deletionRequestId}`,
  rewardChallenges: "/v1/rewards/challenges",
  rewardComplete: (challengeId: string) =>
    `/v1/rewards/challenges/${challengeId}/complete`,
  playbackLeases: "/v1/playback/leases",
  playbackActive: "/v1/playback/leases/active",
  playbackHeartbeat: (leaseId: string) =>
    `/v1/playback/leases/${leaseId}/heartbeats`,
  playbackRenew: (leaseId: string) =>
    `/v1/playback/leases/${leaseId}/renew`,
  playbackRecover: (leaseId: string) =>
    `/v1/playback/leases/${leaseId}/recover`,
  playbackLease: (leaseId: string) => `/v1/playback/leases/${leaseId}`,
  admin: {
    login: "/v1/admin/auth/login",
    dashboard: "/v1/admin/dashboard",
    dramas: "/v1/admin/dramas",
    drama: (dramaId: string) => `/v1/admin/dramas/${dramaId}`,
    submitReview: (dramaId: string) =>
      `/v1/admin/dramas/${dramaId}/submit-review`,
    review: (dramaId: string) => `/v1/admin/dramas/${dramaId}/review`,
    publish: (dramaId: string) => `/v1/admin/dramas/${dramaId}/publish`,
    offline: (dramaId: string) => `/v1/admin/dramas/${dramaId}/offline`,
    uploadSign: "/v1/admin/uploads/sign",
    reviews: "/v1/admin/reviews",
    auditLogs: "/v1/admin/audit-logs",
    circuitBreakers: "/v1/admin/circuit-breakers",
    compensate: "/v1/admin/entitlements/compensate",
    adjustments: "/v1/admin/entitlements/adjustments",
    callbackReplay: (eventId: string) =>
      `/v1/admin/callback-events/${eventId}/replay`,
    releaseGate: "/v1/admin/release-gate"
  }
} as const;

export type ApiSuccess<T> = {
  data: T;
  requestId: string;
};

export type ApiError = {
  code: string;
  message: string;
  requestId: string;
};

export enum DramaStatus {
  DRAFT = "DRAFT",
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  PENDING_REVIEW = "PENDING_REVIEW",
  PENDING_WECHAT = "PENDING_WECHAT",
  READY = "READY",
  PUBLISHED = "PUBLISHED",
  OFFLINE = "OFFLINE",
  ARCHIVED = "ARCHIVED"
}

export enum MediaStatus {
  CREATED = "CREATED",
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  REVIEW_REJECTED = "REVIEW_REJECTED",
  PENDING_MANUAL_REVIEW = "PENDING_MANUAL_REVIEW",
  PENDING_WECHAT = "PENDING_WECHAT",
  READY = "READY",
  FAILED = "FAILED"
}

export enum AdminRole {
  EDITOR = "EDITOR",
  REVIEWER = "REVIEWER",
  ADMIN = "ADMIN"
}

export enum ChallengeStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED"
}

export enum CallbackEventStatus {
  RECEIVED = "RECEIVED",
  PROCESSING = "PROCESSING",
  RETRYABLE_FAILURE = "RETRYABLE_FAILURE",
  DEAD_LETTER = "DEAD_LETTER",
  PROCESSED = "PROCESSED",
  REJECTED = "REJECTED"
}

export enum PlaybackLeaseStatus {
  ACTIVE = "ACTIVE",
  REVOKED = "REVOKED",
  CLOSED = "CLOSED",
  EXPIRED = "EXPIRED"
}

export enum DeletionRequestStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED"
}

export enum EntitlementAdjustmentType {
  FREEZE_REMAINDER = "FREEZE_REMAINDER",
  RELEASE_FREEZE = "RELEASE_FREEZE",
  WRITE_OFF = "WRITE_OFF"
}

export enum EntitlementFactType {
  GRANT = "GRANT",
  DEBIT = "DEBIT",
  ADJUSTMENT = "ADJUSTMENT"
}

export enum PlaybackReservationStatus {
  RESERVED = "RESERVED",
  CONFIRMED = "CONFIRMED",
  RELEASED = "RELEASED",
  UNCONFIRMED = "UNCONFIRMED"
}

export interface DramaCard {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  category: string;
  tags: string[];
  episodeCount: number;
  recommendationRank: number;
  licenseNumber: string;
}

export interface EpisodeSummary {
  id: string;
  episodeNumber: number;
  title: string;
  durationSeconds: number;
  isFree: boolean;
}

export interface DramaDetail extends DramaCard {
  rightsHolder: string;
  episodes: EpisodeSummary[];
}

export interface CatalogResponse {
  featured: DramaCard[];
  latest: DramaCard[];
  popular: DramaCard[];
  categories: string[];
}

export interface EntitlementGrantView {
  id: string;
  grantedSeconds: number;
  remainingSeconds: number;
  grantedAt: string;
  expiresAt: string;
  source: "REWARDED_AD" | "COMPENSATION";
}

export interface EntitlementSummary {
  dramaId: string;
  remainingSeconds: number;
  nearestExpiresAt: string | null;
  grants: EntitlementGrantView[];
}

export interface CreateEntitlementAdjustmentRequest {
  type: EntitlementAdjustmentType;
  grantId: string;
  seconds: number;
  reason: string;
  sourceFactType?: EntitlementFactType;
  sourceFactId?: string;
  freezeAdjustmentId?: string;
  approvalNote?: string;
}

export interface EntitlementAdjustmentView {
  id: string;
  type: EntitlementAdjustmentType;
  grantId: string;
  sourceFactType: EntitlementFactType;
  sourceFactId: string;
  freezeAdjustmentId: string | null;
  seconds: number;
  reason: string;
  remainingSeconds: number;
  createdAt: string;
  replayed: boolean;
}

export interface RewardChallengeView {
  id: string;
  nonce: string;
  expiresAt: string;
  adUnitId: string;
  verificationMode: "server_verified" | "client_attestation";
}

export interface WechatLoginRequest {
  code: string;
}

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface WechatLoginResponse {
  accessToken: string;
  user: AuthenticatedUser;
}

export interface CreateAnonymousSessionRequest {
  deviceId: string;
  sessionId: string;
}

export interface AnonymousSessionResponse {
  accessToken: string;
  expiresAt: string;
  tokenKind: "viewer";
}

export interface CreateDeletionRequest {
  confirmation: typeof DELETION_CONFIRMATION;
}

export interface CreateDeletionRequestResponse {
  deletionRequestId: string;
  status: DeletionRequestStatus;
  deletionQueryToken?: string;
  tokenExpiresAt: string;
  replayed: boolean;
}

export interface DeletionRequestView {
  deletionRequestId: string;
  status: DeletionRequestStatus;
  createdAt: string;
  processedAt: string | null;
  tokenExpiresAt: string;
  reason: string | null;
}

export interface CreateRewardChallengeRequest {
  dramaId: string;
  sessionId: string;
}

export interface CompleteRewardChallengeRequest {
  nonce: string;
  isEnded: true;
  clientCompletedAt: string;
}

export interface CreatePlaybackLeaseRequest {
  episodeId: string;
  deviceId: string;
}

export interface UpdateWatchProgressRequest {
  dramaId: string;
  episodeId: string;
  mediaPositionSeconds: number;
}

export interface PlaybackLeaseView {
  id: string;
  episodeId: string;
  status: PlaybackLeaseStatus;
  playbackUrl: string;
  playbackTokenExpiresAt: string;
  heartbeatIntervalSeconds: number;
  remainingSeconds: number | null;
  isFree: boolean;
  currentWindow?: PlaybackReservationView | null;
}

export interface PlaybackReservationView {
  id: string;
  leaseId: string;
  windowIndex: number;
  reservedSeconds: number;
  status: PlaybackReservationStatus;
  expiresAt: string;
}

export interface ActivePlaybackLeaseResponse {
  lease: PlaybackLeaseView | null;
  reservations: PlaybackReservationView[];
  unconfirmedCount: number;
  recoverAction: "none" | "recover" | "customer_service";
}

export interface RecoverPlaybackLeaseRequest {
  deviceId: string;
  reason: string;
}

export interface PlaybackHeartbeatRequest {
  seq: number;
  mediaPositionSeconds: number;
  previousMediaPositionSeconds: number;
  playbackRate: number;
  state: "playing" | "paused" | "buffering" | "background";
  windowId?: string;
}

export interface PlaybackHeartbeatResponse {
  acknowledgedSeq: number;
  debitedSeconds: number;
  remainingSeconds: number | null;
  mayContinue: boolean;
  reason?: "ENTITLEMENT_EXHAUSTED" | "LEASE_REVOKED" | "DRAMA_OFFLINE";
}

export interface ReplayCallbackEventRequest {
  reason: string;
  approvalNote?: string;
}

export interface CallbackReplayView {
  eventId: string;
  status: CallbackEventStatus;
  attempts: number;
  replayed: boolean;
}

export interface WatchHistoryItem {
  drama: DramaCard;
  episodeNumber: number;
  mediaPositionSeconds: number;
  updatedAt: string;
}

export interface ReleaseGateStatus {
  entityApproved: boolean;
  miniProgramFilingApproved: boolean;
  wechatCategoryApproved: boolean;
  adsApproved: boolean;
  readyForExternalTraffic: boolean;
  blockers: string[];
}
