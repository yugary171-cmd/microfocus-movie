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
export const CALLBACK_LATE_REWARD_WINDOW_SECONDS = 2 * 60 * 60;
export const CALLBACK_PAYLOAD_RETENTION_SECONDS = 30 * 24 * 60 * 60;
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE = 100;
export const DRAMA_TITLE_MAX_LENGTH = 120;
export const DRAMA_SUMMARY_MAX_LENGTH = 2000;
export const DRAMA_CATEGORY_MAX_LENGTH = 64;
export const DRAMA_TAG_MAX_LENGTH = 32;
export const DRAMA_TAG_MAX_COUNT = 20;
export const DRAMA_EPISODE_MAX_COUNT = 200;
export const EPISODE_TITLE_MAX_LENGTH = 120;
export const EPISODE_DURATION_SECONDS_MAX = 3600;
export const COVER_URL_MAX_LENGTH = 2048;
export const RIGHTS_HOLDER_MAX_LENGTH = 200;
export const RIGHTS_DOCUMENT_MAX_LENGTH = 128;
export const RIGHTS_MATERIAL_KEY_MAX_LENGTH = 512;
export const ENTITY_ID_MAX_LENGTH = 191;
export const ADMIN_REASON_MIN_LENGTH = 6;
export const ADMIN_REASON_MAX_LENGTH = 300;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const DELETION_QUERY_TOKEN_MAX_LENGTH = 128;
export const BEARER_TOKEN_MAX_LENGTH = 4096;
export const PROVIDER_SIGNATURE_MAX_LENGTH = 256;
export const COMPENSATION_SECONDS_MIN = 60;
export const ENTITLEMENT_SECONDS_MAX = 86_400;
export const DEVICE_ID_MAX_LENGTH = 128;
export const SESSION_ID_MAX_LENGTH = 128;
export const WECHAT_CODE_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;
export const OTP_MAX_LENGTH = 8;
export const HEARTBEAT_SEQ_MAX = 1_000_000;
export const REWARD_NONCE_MAX_LENGTH = 128;
export const ADMIN_LIST_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE = 100;

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
  CALLBACK_DEAD_LETTER: "CALLBACK_DEAD_LETTER",
  CALLBACK_PAYLOAD_UNAVAILABLE: "CALLBACK_PAYLOAD_UNAVAILABLE",
  NOT_READY: "NOT_READY",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  REAUTH_MISMATCH: "REAUTH_MISMATCH",
  DELETION_IDENTITY_MISMATCH: "DELETION_IDENTITY_MISMATCH",
  INVALID_ENTITY_ID: "INVALID_ENTITY_ID",
  RATE_LIMITED: "RATE_LIMITED"
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
    rights: (dramaId: string) => `/v1/admin/dramas/${dramaId}/rights`,
    mediaAssets: (dramaId: string) => `/v1/admin/dramas/${dramaId}/media-assets`,
    submitReview: (dramaId: string) =>
      `/v1/admin/dramas/${dramaId}/submit-review`,
    review: (dramaId: string) => `/v1/admin/dramas/${dramaId}/review`,
    publish: (dramaId: string) => `/v1/admin/dramas/${dramaId}/publish`,
    offline: (dramaId: string) => `/v1/admin/dramas/${dramaId}/offline`,
    uploadSign: "/v1/admin/uploads/sign",
    mediaReview: (assetId: string) => `/v1/admin/media-assets/${assetId}/review`,
    reviews: "/v1/admin/reviews",
    auditLogs: "/v1/admin/audit-logs",
    circuitBreakers: "/v1/admin/circuit-breakers",
    circuitBreaker: (provider: string) => `/v1/admin/circuit-breakers/${provider}`,
    compensate: "/v1/admin/entitlements/compensate",
    adjustments: "/v1/admin/entitlements/adjustments",
    callbackEvents: "/v1/admin/callback-events",
    callbackReplay: (eventId: string) =>
      `/v1/admin/callback-events/${eventId}/replay`,
    deletionRequests: "/v1/admin/deletion-requests",
    deletionRequest: (deletionRequestId: string) =>
      `/v1/admin/deletion-requests/${deletionRequestId}`,
    deletionQueryTokenReissue: (deletionRequestId: string) =>
      `/v1/admin/deletion-requests/${deletionRequestId}/query-tokens`,
    releaseGate: "/v1/admin/release-gate"
  },
  health: {
    root: "/health",
    live: "/health/live",
    ready: "/health/ready"
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
  COMPLETED_LATE = "COMPLETED_LATE",
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
  wechatCode: string;
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

export interface AdminDeletionRequestView {
  deletionRequestId: string;
  userId: string;
  status: DeletionRequestStatus;
  createdAt: string;
  processedAt: string | null;
  tokenExpiresAt: string;
  reason: string | null;
}

export interface ReissueDeletionQueryTokenRequest {
  userId: string;
  reason: string;
  approvalNote: string;
}

export interface ReissueDeletionQueryTokenResponse {
  deletionRequestId: string;
  status: DeletionRequestStatus;
  tokenExpiresAt: string;
  deletionQueryToken?: string;
  replayed: boolean;
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
  wechatCode: string;
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
  reason?: "ENTITLEMENT_EXHAUSTED" | "LEASE_REVOKED" | "DRAMA_OFFLINE" | "UNCONFIRMED_EXPOSURE";
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
  executed: boolean;
}

export interface AdminCallbackEventView {
  eventId: string;
  provider: string;
  eventType: string;
  status: CallbackEventStatus;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
  processingUntil: string | null;
  outcome: string | null;
  payloadAvailable: boolean;
  replayable: boolean;
}

export interface AdminCallbackEventList {
  items: AdminCallbackEventView[];
  total: number;
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
