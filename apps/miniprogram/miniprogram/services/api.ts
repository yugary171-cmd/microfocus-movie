import { boundedIdempotencyKey, ERROR_CODES, normalizeAuthenticatedUser, type AnonymousSessionResponse, type ApiError, type ApiSuccess, type AuthenticatedUser, type UpdateUserProfileRequest } from "@microfocus/contracts";
import { RUNTIME_CONFIG } from "../config/runtime";
import { API_ROUTES, encodedRoute } from "../constants/routes";
import { mockApi } from "../mocks/data";
import { syncMockProfile } from "../mocks/profile-state";
import type { AuthSession, ClientApi, SearchResponse } from "../types/api";
import { ApiClientError } from "../utils/errors";
import { wechatAdapter } from "./wechat-adapter";

const ACCESS_TOKEN_KEY = "microfocus.access-token";
const SESSION_USER_KEY = "microfocus.session-user";
const VIEWER_TOKEN_KEY = "microfocus.viewer-token";
const DEVICE_ID_KEY = "microfocus.device-id";
const VIEWER_SESSION_ID_KEY = "microfocus.viewer-session-id";
let sessionRefreshPromise: Promise<AuthSession> | null = null;
let viewerTokenPromise: Promise<string> | null = null;

interface RequestResponse<T> {
  data: T | ApiSuccess<T> | ApiError;
  statusCode: number;
  header: Record<string, string>;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function isMockMode(): boolean {
  return wechatAdapter.getEnvVersion() === "develop" && !RUNTIME_CONFIG.apiBaseUrl.trim();
}

export function getStoredAccessToken(): string {
  try {
    return wx.getStorageSync<string>(ACCESS_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    const accessToken = getStoredAccessToken();
    const storedUser = wx.getStorageSync<WechatMiniprogram.IAnyObject>(SESSION_USER_KEY);
    const user = normalizeAuthenticatedUser(storedUser);
    if (!accessToken || !user) {
      return null;
    }
    return {
      accessToken,
      user
    };
  } catch {
    return null;
  }
}

function createLocalId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateStorageId(key: string, prefix: string): string {
  try {
    const existing = wx.getStorageSync<string>(key);
    if (typeof existing === "string" && existing.length >= 8) return existing;
  } catch {
    // continue
  }
  const created = createLocalId(prefix);
  wx.setStorageSync(key, created);
  return created;
}

function getStoredViewerToken(): string {
  try {
    return wx.getStorageSync<string>(VIEWER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function clearViewerToken(): void {
  wx.removeStorageSync(VIEWER_TOKEN_KEY);
}

async function ensureViewerAccessToken(): Promise<string> {
  const existing = getStoredViewerToken();
  if (existing) return existing;
  if (viewerTokenPromise) return viewerTokenPromise;
  viewerTokenPromise = (async () => {
    const deviceId = getOrCreateStorageId(DEVICE_ID_KEY, "dev");
    const sessionId = getOrCreateStorageId(VIEWER_SESSION_ID_KEY, "ses");
    const session = await request<AnonymousSessionResponse>(
      API_ROUTES.auth.anonymous,
      "POST",
      { deviceId, sessionId },
      undefined,
      undefined,
      false
    );
    wx.setStorageSync(VIEWER_TOKEN_KEY, session.accessToken);
    return session.accessToken;
  })().finally(() => {
    viewerTokenPromise = null;
  });
  return viewerTokenPromise;
}

async function resolveRequestToken(path: string): Promise<string> {
  const userToken = getStoredAccessToken();
  if (userToken) return userToken;
  if (path === API_ROUTES.auth.anonymous || path === API_ROUTES.auth.wechat) return "";
  if (path.startsWith(API_ROUTES.playbackLeases)) return ensureViewerAccessToken();
  return "";
}

function readErrorCode(body: unknown): string {
  if (body && typeof body === "object" && "code" in body && typeof (body as ApiError).code === "string") {
    return (body as ApiError).code;
  }
  return "";
}

function isEnvelope<T>(body: T | ApiSuccess<T>): body is ApiSuccess<T> {
  return (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    "requestId" in body
  );
}

async function request<T>(
  path: string,
  method: HttpMethod = "GET",
  data?: unknown,
  query?: Record<string, string | number>,
  extraHeaders?: Record<string, string>,
  retryAuthentication = true
): Promise<T> {
  if (!RUNTIME_CONFIG.apiBaseUrl.trim()) {
    throw new ApiClientError("尚未配置服务地址，发布环境不能使用体验数据", "CONFIG_REQUIRED", 0);
  }
  const queryString = query
    ? `?${Object.entries(query)
        .filter(([, value]) => value !== "")
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join("&")}`
    : "";
  const token = await resolveRequestToken(path);
  const response = await wechatAdapter.request<RequestResponse<T>>({
    url: `${RUNTIME_CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}${queryString}`,
    method,
    ...(data === undefined
      ? {}
      : { data: data as WechatMiniprogram.IAnyObject }),
    timeout: RUNTIME_CONFIG.requestTimeoutMs,
    header: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    }
  } as WechatMiniprogram.RequestOption);
  const body = response.data;
  const code = readErrorCode(body);
  if (code === ERROR_CODES.ACCOUNT_UNAVAILABLE) {
    clearStoredSession();
    const apiError = body as ApiError;
    throw new ApiClientError(
      apiError?.message || "账号已申请注销，登录已失效",
      ERROR_CODES.ACCOUNT_UNAVAILABLE,
      response.statusCode,
      apiError?.requestId || ""
    );
  }
  if (
    response.statusCode === 401 &&
    retryAuthentication &&
    path !== API_ROUTES.auth.wechat &&
    path !== API_ROUTES.auth.anonymous
  ) {
    if (code === ERROR_CODES.ANONYMOUS_SESSION_EXPIRED || path.startsWith(API_ROUTES.playbackLeases)) {
      clearViewerToken();
      await ensureViewerAccessToken();
      return request<T>(path, method, data, query, extraHeaders, false);
    }
    clearStoredSession();
    await refreshSession();
    return request<T>(path, method, data, query, extraHeaders, false);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const apiError = body as ApiError;
    throw new ApiClientError(
      apiError?.message || `请求失败（${response.statusCode}）`,
      apiError?.code || "HTTP_ERROR",
      response.statusCode,
      apiError?.requestId || ""
    );
  }
  return isEnvelope(body as T | ApiSuccess<T>)
    ? (body as ApiSuccess<T>).data
    : (body as T);
}

const realApi: ClientApi = {
  authWechat: (code) => request<AuthSession>(API_ROUTES.auth.wechat, "POST", { code }),
  authAnonymous: (input) =>
    request<AnonymousSessionResponse>(API_ROUTES.auth.anonymous, "POST", input, undefined, undefined, false),
  getCatalog: () => request(API_ROUTES.catalog),
  search: async (q, category, page) => {
    const result = await request<SearchResponse | SearchResponse["items"]>(
      API_ROUTES.search,
      "GET",
      undefined,
      { q, category, page }
    );
    return Array.isArray(result)
      ? { items: result, page, hasMore: false }
      : {
          items: Array.isArray(result?.items) ? result.items : [],
          page: Number(result?.page) || page,
          hasMore: Boolean(result?.hasMore)
        };
  },
  getDrama: (id) => request(encodedRoute(API_ROUTES.drama, id)),
  getHistory: () => request(API_ROUTES.history),
  deleteHistory: (input) => request(API_ROUTES.history, "DELETE", input),
  getProfile: () => request(API_ROUTES.profile),
  updateProfile: (input) => request(API_ROUTES.profile, "PATCH", input),
  saveProgress: (input) => request<void>(API_ROUTES.progress, "PUT", input),
  getEntitlement: (dramaId) => request(encodedRoute(API_ROUTES.entitlement, dramaId)),
  createRewardChallenge: (input) => request(API_ROUTES.rewardChallenges, "POST", input),
  completeRewardChallenge: (challengeId, input) =>
    request<void>(
      encodedRoute(API_ROUTES.rewardComplete, challengeId),
      "POST",
      input,
      undefined,
      { "Idempotency-Key": boundedIdempotencyKey("reward-", challengeId) }
    ),
  createPlaybackLease: (input) => request(API_ROUTES.playbackLeases, "POST", input),
  getActivePlaybackLease: () => request(API_ROUTES.playbackActive),
  recoverPlaybackLease: (leaseId, input) =>
    request(encodedRoute(API_ROUTES.playbackRecover, leaseId), "POST", input),
  heartbeat: (leaseId, input) => request(encodedRoute(API_ROUTES.playbackHeartbeat, leaseId), "POST", input),
  renewPlaybackLease: (leaseId) => request(encodedRoute(API_ROUTES.playbackRenew, leaseId), "POST"),
  closePlaybackLease: (leaseId) => request(encodedRoute(API_ROUTES.playbackLease, leaseId), "DELETE"),
  createDeletionRequest: (input) => {
    const session = getStoredSession();
    return request(
      API_ROUTES.deletionRequests,
      "POST",
      input,
      undefined,
      { "Idempotency-Key": boundedIdempotencyKey("d:", session?.user.id ?? "session") }
    );
  },
  getDeletionRequest: (deletionRequestId, queryToken) =>
    request(
      encodedRoute(API_ROUTES.deletionRequest, deletionRequestId),
      "GET",
      undefined,
      undefined,
      { "X-Deletion-Query-Token": queryToken },
      false
    )
};

export function getApi(): ClientApi {
  return isMockMode() ? mockApi : realApi;
}

export function clearStoredSession(): void {
  wx.removeStorageSync(ACCESS_TOKEN_KEY);
  wx.removeStorageSync(SESSION_USER_KEY);
}

export function applyLocalWechatProfile(profile: {
  displayName: string;
  avatarUrl: string | null;
}): AuthSession | null {
  const session = getStoredSession();
  if (!session) return null;
  const displayName = profile.displayName.trim().slice(0, 32) || session.user.displayName;
  const stored = storeSession({
    ...session,
    user: {
      ...session.user,
      displayName,
      avatarUrl: profile.avatarUrl ?? session.user.avatarUrl
    }
  });
  if (isMockMode()) syncMockProfile(stored.user);
  return stored;
}

export async function saveProfile(input: UpdateUserProfileRequest): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  if (isMockMode()) syncMockProfile(session.user);
  const user = await getApi().updateProfile(input);
  return replaceStoredUser(user);
}

export async function loadProfile(): Promise<AuthenticatedUser | null> {
  const session = getStoredSession();
  if (!session) return null;
  if (isMockMode()) syncMockProfile(session.user);
  const user = await getApi().getProfile();
  return replaceStoredUser(user)?.user ?? user;
}

export function replaceStoredUser(user: AuthenticatedUser): AuthSession | null {
  const session = getStoredSession();
  const next = normalizeAuthenticatedUser(user);
  if (!session || !next) return null;
  return storeSession({ ...session, user: next });
}

function storeSession(session: AuthSession): AuthSession {
  wx.setStorageSync(ACCESS_TOKEN_KEY, session.accessToken);
  wx.setStorageSync(SESSION_USER_KEY, session.user);
  return session;
}

function refreshSession(): Promise<AuthSession> {
  if (sessionRefreshPromise) return sessionRefreshPromise;
  sessionRefreshPromise = (async () => {
    const code = await wechatAdapter.login();
    if (isMockMode()) {
      return storeSession(await mockApi.authWechat(code));
    }
    const session = await request<AuthSession>(
      API_ROUTES.auth.wechat,
      "POST",
      { code },
      undefined,
      undefined,
      false
    );
    return storeSession(session);
  })().finally(() => {
    sessionRefreshPromise = null;
  });
  return sessionRefreshPromise;
}

export async function ensureSession(): Promise<AuthSession> {
  // This is an explicit user-login action, not a silent session lookup. Always
  // request a fresh WeChat code before creating the application session.
  clearStoredSession();
  return refreshSession();
}
