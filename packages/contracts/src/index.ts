export const FREE_EPISODE_COUNT = 2;
export const REWARD_SECONDS = 600;
export const REWARD_TTL_SECONDS = 24 * 60 * 60;
export const HEARTBEAT_INTERVAL_SECONDS = 5;
export const OFFLINE_GRACE_SECONDS = 15;
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRatePreset = (typeof PLAYBACK_RATES)[number];
export const PLAYBACK_RATE_MIN = 0.75;
export const PLAYBACK_RATE_MAX = 2;
export const PLAYBACK_RATE_DEFAULT = 1;
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
export const HISTORY_LIST_LIMIT = 50;
export const HISTORY_DELETE_MAX_IDS = HISTORY_LIST_LIMIT;
export const SOCIAL_LIST_PAGE_SIZE = 20;
export const SOCIAL_LIST_MAX_PAGE = 100;
export const COMMENT_BODY_MAX_LENGTH = 500;
export const MESSAGE_BODY_MAX_LENGTH = 1000;
/** Seconds from episode end that still count as watched through. v0 default, not a growth lever. */
export const EPISODE_COMPLETE_TOLERANCE_SECONDS = 3;
export const COMMENT_TARGET_TYPES = ["DRAMA", "USER"] as const;
export type CommentTargetType = (typeof COMMENT_TARGET_TYPES)[number];
export const COMMENT_STATUSES = ["VISIBLE", "HIDDEN", "DELETED"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export const DRAMA_TITLE_MAX_LENGTH = 120;
export const DRAMA_SUMMARY_MAX_LENGTH = 2000;
export const DRAMA_CATEGORY_MAX_LENGTH = 64;
export const DRAMA_TAG_MAX_LENGTH = 32;
export const DRAMA_TAG_MAX_COUNT = 20;
export const DRAMA_EPISODE_MAX_COUNT = 200;
export const RECOMMENDATION_RANK_MIN = 0;
export const RECOMMENDATION_RANK_MAX = 9999;
export const RECOMMENDATION_RANK_DEFAULT = 0;
export const EPISODE_TITLE_MAX_LENGTH = 120;
export const EPISODE_DURATION_SECONDS_MAX = 3600;
export const COVER_URL_MAX_LENGTH = 2048;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 10;
export const SIGNATURE_MAX_LENGTH = 100;
export const PROFILE_GENDERS = ["male", "female", "unset"] as const;
export type ProfileGender = (typeof PROFILE_GENDERS)[number];
export const RIGHTS_HOLDER_MAX_LENGTH = 200;
export const RIGHTS_DOCUMENT_MAX_LENGTH = 128;
export const RIGHTS_MATERIAL_KEY_MAX_LENGTH = 512;
export const RIGHTS_TERRITORY = "CN";
export const RIGHTS_MATERIAL_DIGEST_LENGTH = 64;
export const RIGHTS_MATERIAL_DIGEST_INPUT_PATTERN = `[A-Fa-f0-9]{${RIGHTS_MATERIAL_DIGEST_LENGTH}}`;
export const RIGHTS_MATERIAL_DIGEST_PATTERN = new RegExp(
  `^[a-f0-9]{${RIGHTS_MATERIAL_DIGEST_LENGTH}}$`,
  "i"
);
export const ENTITY_ID_MAX_LENGTH = 191;
export const ADMIN_REASON_MIN_LENGTH = 6;
export const ADMIN_REASON_MAX_LENGTH = 300;
export const REVIEW_NOTES_MAX_LENGTH = 2000;
export const MEDIA_REVIEW_NOTES_MIN_LENGTH = 6;
export const MEDIA_REVIEW_NOTES_MAX_LENGTH = 500;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const REQUEST_ID_MAX_LENGTH = 128;
export const RATE_LIMIT_BUCKET_ID_MAX_LENGTH = 128;
export const RATE_LIMIT_SCOPE_MAX_LENGTH = 32;
export const RATE_LIMIT_CLIENT_KEY_MAX_LENGTH = 128;
export const CIRCUIT_UPDATED_BY_MAX_LENGTH = 128;
export const CIRCUIT_PROVIDER_NAME_MAX_LENGTH = 32;
export const REQUEST_LOG_PATH_MAX_LENGTH = 256;
export const REQUEST_LOG_METHOD_MAX_LENGTH = 16;
export const REQUEST_LOG_ACTOR_KIND_MAX_LENGTH = 32;
export const REQUEST_LOG_LABEL_MAX_LENGTH = 64;
export const JSON_BODY_LIMIT = "64kb";
export const REQUEST_ID_PATTERN = new RegExp(
  `^[A-Za-z0-9._:-]{1,${REQUEST_ID_MAX_LENGTH}}$`
);
export const DELETION_QUERY_TOKEN_MAX_LENGTH = 128;
export const BEARER_TOKEN_MAX_LENGTH = 4096;
export const PROVIDER_SIGNATURE_MAX_LENGTH = 256;
export const COMPENSATION_SECONDS_MIN = 60;
export const ENTITLEMENT_SECONDS_MAX = 86_400;
export const DEVICE_ID_MAX_LENGTH = 128;
export const SESSION_ID_MAX_LENGTH = 128;
export const WECHAT_CODE_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 8;
export const OTP_INPUT_LENGTH = 6;
export const OTP_INPUT_PATTERN = `[0-9]{${OTP_INPUT_LENGTH}}`;
export const HEARTBEAT_SEQ_MAX = 1_000_000;
export const REWARD_NONCE_MAX_LENGTH = 128;
export const ADMIN_LIST_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE = 100;
export const LIST_QUERY_MAX_LENGTH = 100;
export const UPLOAD_FILE_NAME_MAX_LENGTH = 255;
export const UPLOAD_FILE_SIZE_MAX_BYTES = 5 * 1024 * 1024 * 1024;
export const UPLOAD_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/octet-stream"
] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];
export const UPLOAD_FILE_ACCEPT = "video/mp4,video/quicktime,video/webm";

/** Trim then cap list/search keywords so clients match server truncation. */
export function boundListQuery(value: string): string {
  return value.trim().slice(0, LIST_QUERY_MAX_LENGTH);
}

export function boundCommentBody(value: string): string {
  return value.trim().slice(0, COMMENT_BODY_MAX_LENGTH);
}

export function boundMessageBody(value: string): string {
  return value.trim().slice(0, MESSAGE_BODY_MAX_LENGTH);
}

export function isCommentTargetType(value: unknown): value is CommentTargetType {
  return value === "DRAMA" || value === "USER";
}

/** Deduplicate trimmed drama ids and drop blank or overlong values. */
export function uniqueHistoryDramaIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || id.length > ENTITY_ID_MAX_LENGTH || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

/** Cap circuit actor ids so writes fit CircuitBreaker.updatedBy. */
export function boundCircuitUpdatedBy(value: string): string {
  return value.trim().slice(0, CIRCUIT_UPDATED_BY_MAX_LENGTH);
}

export function isAllowedUploadFileName(fileName: string): boolean {
  const name = fileName.trim();
  return name.length >= 1 && name.length <= UPLOAD_FILE_NAME_MAX_LENGTH && !/[/\\\0]/.test(name);
}

export function isAllowedUploadFileSize(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= UPLOAD_FILE_SIZE_MAX_BYTES;
}

export function isRightsMaterialDigest(value: string): boolean {
  return RIGHTS_MATERIAL_DIGEST_PATTERN.test(value.trim());
}

export function isRequestId(value: string): boolean {
  return REQUEST_ID_PATTERN.test(value);
}

export function isPlaybackRatePreset(rate: number): rate is PlaybackRatePreset {
  return (PLAYBACK_RATES as readonly number[]).includes(rate);
}

export function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return PLAYBACK_RATE_DEFAULT;
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, rate));
}

/** Median of positive episode durations; even counts average the two middle values. */
export function medianPositiveDurationSeconds(values: readonly number[]): number | null {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positive.length === 0) return null;
  const sorted = [...positive].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Remaining-balance episode count; 0 when remaining is below one median episode. */
export function approximateRemainingEpisodeCount(
  remainingSeconds: number,
  medianDurationSeconds: number
): number {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 0;
  if (!Number.isFinite(medianDurationSeconds) || medianDurationSeconds <= 0) return 0;
  return Math.floor(remainingSeconds / medianDurationSeconds);
}

/** Grant-size copy: N = max(1, floor(REWARD_SECONDS / median published duration)). */
export function approximateRewardEpisodeCount(durationsSeconds: readonly number[]): number {
  const median = medianPositiveDurationSeconds(durationsSeconds);
  if (median == null) return 1;
  return Math.max(1, Math.floor(REWARD_SECONDS / median));
}

export function resolveUploadContentType(fileType: string): UploadContentType | null {
  const type = fileType.trim();
  if (!type) return "application/octet-stream";
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(type) ? (type as UploadContentType) : null;
}

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
  RATE_LIMITED: "RATE_LIMITED",
  FOLLOW_REQUIRED: "FOLLOW_REQUIRED"
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
  profile: "/v1/me/profile",
  entitlement: (dramaId: string) => `/v1/entitlements/${dramaId}`,
  deletionRequests: "/v1/me/deletion-requests",
  deletionRequest: (deletionRequestId: string) =>
    `/v1/me/deletion-requests/${deletionRequestId}`,
  user: (userId: string) => `/v1/users/${userId}`,
  userFollow: (userId: string) => `/v1/users/${userId}/follow`,
  userFollowers: (userId: string) => `/v1/users/${userId}/followers`,
  userFollowing: (userId: string) => `/v1/users/${userId}/following`,
  userWall: (userId: string) => `/v1/users/${userId}/wall`,
  meFollowers: "/v1/me/followers",
  meFollowing: "/v1/me/following",
  dramaComments: (dramaId: string) => `/v1/dramas/${dramaId}/comments`,
  comment: (commentId: string) => `/v1/comments/${commentId}`,
  commentReplies: (commentId: string) => `/v1/comments/${commentId}/replies`,
  commentLikes: (commentId: string) => `/v1/comments/${commentId}/likes`,
  meComments: "/v1/me/comments",
  meCommentInbox: "/v1/me/comment-inbox",
  meReceivedCommentLikes: "/v1/me/received-comment-likes",
  meConversations: "/v1/me/conversations",
  meConversation: (conversationId: string) => `/v1/me/conversations/${conversationId}`,
  meConversationMessages: (conversationId: string) =>
    `/v1/me/conversations/${conversationId}/messages`,
  meConversationRead: (conversationId: string) => `/v1/me/conversations/${conversationId}/read`,
  meFavorites: "/v1/me/favorites",
  meFavorite: (dramaId: string) => `/v1/me/favorites/${dramaId}`,
  meLikedDramas: "/v1/me/liked-dramas",
  meLikedDrama: (dramaId: string) => `/v1/me/liked-dramas/${dramaId}`,
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
    root: "/v1/admin",
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
  /** Provider-facing; not used by viewer or admin clients. */
  callbacks: {
    vod: "/v1/callbacks/vod",
    reward: "/v1/callbacks/reward"
  },
  health: {
    root: "/health",
    live: "/health/live",
    ready: "/health/ready"
  }
} as const;

/** URL-encode a path entity id before interpolating `API_ROUTES`. */
export function encodedRoute(build: (id: string) => string, id: string): string {
  return build(encodeURIComponent(id));
}

/**
 * Keep viewer Idempotency-Key headers within IDEMPOTENCY_KEY_MAX_LENGTH.
 * Short ids stay `prefix + value` so in-flight retries do not change key.
 * Oversized ids fold to a stable 16-char FNV-1a hex suffix.
 */
export function boundedIdempotencyKey(prefix: string, value: string): string {
  const part = value.trim();
  const raw = `${prefix}${part}`;
  if (raw.length <= IDEMPOTENCY_KEY_MAX_LENGTH) return raw;
  return `${prefix}${fnv1a64Hex(part)}`;
}

function fnv1a32(input: string, offset: number): number {
  let hash = offset >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function fnv1a64Hex(input: string): string {
  const low = fnv1a32(input, 0x811c9dc5);
  const high = fnv1a32(input, 0x811c9dc5 ^ 0x9e3779b9);
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

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
  filterOptions: HomeFilterOptions;
}

export interface HomeFilterOptions {
  subjects: string[];
  settings: string[];
  backgrounds: string[];
}

export interface DramaSearchFilters {
  subject?: string;
  setting?: string;
  background?: string;
  tags?: string[];
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
  signature: string;
  gender: ProfileGender;
}

export interface PublicUserProfile extends AuthenticatedUser {
  followerCount: number;
  followingCount: number;
  receivedCommentLikeCount: number;
  followedByMe: boolean;
}

export interface FollowUserCard {
  user: PublicUserProfile;
  followedAt: string;
}

export interface CreateCommentRequest {
  body: string;
  parentCommentId?: string;
  episodeId?: string;
}

export interface CommentView {
  id: string;
  author: AuthenticatedUser;
  targetType: CommentTargetType;
  dramaId: string | null;
  targetUserId: string | null;
  episodeId: string | null;
  parentCommentId: string | null;
  replyToUserId: string | null;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  status: CommentStatus;
  createdAt: string;
}

export interface CommentLikeView {
  commentId: string;
  actor: AuthenticatedUser;
  createdAt: string;
}

export interface CreateConversationRequest {
  peerUserId: string;
}

export interface DirectConversationView {
  id: string;
  peer: AuthenticatedUser;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface CreateDirectMessageRequest {
  body: string;
}

export interface DramaLibraryItem {
  drama: DramaCard;
  createdAt: string;
  resumeEpisodeNumber: number | null;
  resumePositionSeconds: number | null;
}

export interface SocialPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

export interface UpdateUserProfileRequest {
  displayName?: string;
  signature?: string;
  gender?: ProfileGender;
  avatarUrl?: string | null;
}

export function isProfileGender(value: unknown): value is ProfileGender {
  return value === "male" || value === "female" || value === "unset";
}

export function normalizeAuthenticatedUser(value: unknown): AuthenticatedUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.displayName !== "string") return null;
  return {
    id: record.id,
    displayName: record.displayName,
    avatarUrl: typeof record.avatarUrl === "string" && record.avatarUrl.trim() ? record.avatarUrl.trim() : null,
    signature: typeof record.signature === "string" ? record.signature.slice(0, SIGNATURE_MAX_LENGTH) : "",
    gender: isProfileGender(record.gender) ? record.gender : "unset"
  };
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
  /** Present after episode-complete facts exist; omit means unknown, not incomplete. */
  completed?: boolean;
}

export interface DeleteWatchHistoryRequest {
  dramaIds: string[];
}

export interface DeleteWatchHistoryResponse {
  deletedDramaIds: string[];
}

export interface ReleaseGateStatus {
  entityApproved: boolean;
  miniProgramFilingApproved: boolean;
  wechatCategoryApproved: boolean;
  adsApproved: boolean;
  readyForExternalTraffic: boolean;
  blockers: string[];
}

/** Fail-closed until product, legal/privacy, and engineering freeze the matrix together. */
export const RETENTION_MATRIX_APPROVED = false;

export const ANONYMIZED_USER_DISPLAY_NAME = "已注销用户";

export type RetentionAction = "retain" | "anonymize_when_approved" | "delete_when_approved";

export const DATA_RETENTION_CLASSES = [
  {
    id: "user_profile",
    examples: "displayName, avatarUrl, signature, gender, openId",
    action: "anonymize_when_approved" as const,
    retainReason: "直接身份在批准后匿名化；批准前只撤权不清理"
  },
  {
    id: "watch_progress",
    examples: "WatchProgress",
    action: "delete_when_approved" as const,
    retainReason: "可删除观看进度；批准前不删除"
  },
  {
    id: "social_library",
    examples: "UserFollow, Comment, CommentLike, DirectMessage, DramaFavorite, DramaLike, WatchEpisodeProgress",
    action: "delete_when_approved" as const,
    retainReason: "社交与片库可删除；批准前不删除"
  },
  {
    id: "entitlement_ledger",
    examples: "EntitlementGrant, EntitlementDebit, adjustments",
    action: "retain" as const,
    retainReason: "财务与权益审计，注销不得删除"
  },
  {
    id: "reward_challenges",
    examples: "RewardChallenge",
    action: "retain" as const,
    retainReason: "广告争议与补偿核验"
  },
  {
    id: "playback_leases",
    examples: "PlaybackLease and reservation facts",
    action: "retain" as const,
    retainReason: "播放与扣费审计"
  },
  {
    id: "admin_audit",
    examples: "AuditLog, operationalEvent",
    action: "retain" as const,
    retainReason: "安全与运营审计"
  },
  {
    id: "callback_events",
    examples: "CallbackEvent metadata",
    action: "retain" as const,
    retainReason: "事故证据；密文另按已实现载荷保留期清除"
  },
  {
    id: "deletion_requests",
    examples: "DeletionRequest token hash",
    action: "retain" as const,
    retainReason: "注销处理证明"
  }
] satisfies Array<{
  id: string;
  examples: string;
  action: RetentionAction;
  retainReason: string;
}>;

export const FUNNEL_EVENTS = [
  "drama_card_click",
  "drama_detail_view",
  "episode_click",
  "playback_start",
  "playback_pause",
  "playback_complete",
  "lock_intercept_shown",
  "ad_start",
  "ad_end",
  "ad_fail",
  "challenge_create",
  "reward_confirm",
  "entitlement_credited",
  "lease_create",
  "heartbeat_ok",
  "heartbeat_fail",
  "playback_error",
  "offline_block"
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export const WATCH_PATH_ERROR_CLASSES = {
  AD_NOT_COMPLETED: "ad_incomplete",
  AD_NO_FILL: "ad_no_fill",
  AD_LOAD_FAILED: "ad_load_failed",
  REWARD_NOT_VERIFIED: "reward_pending",
  CHALLENGE_EXPIRED: "reward_expired",
  UNCONFIRMED_EXPOSURE_LIMIT: "playback_unconfirmed",
  CUSTOMER_SERVICE_REQUIRED: "playback_recover_cs",
  ACCOUNT_UNAVAILABLE: "account_unavailable"
} as const;

export function classifyWatchPathError(code: string): string {
  if (code in WATCH_PATH_ERROR_CLASSES) {
    return WATCH_PATH_ERROR_CLASSES[code as keyof typeof WATCH_PATH_ERROR_CLASSES];
  }
  return "unclassified";
}
