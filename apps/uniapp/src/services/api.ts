import { ERROR_CODES, type AnonymousSessionResponse, type ApiError, type ApiSuccess } from "@microfocus/contracts";
import { RUNTIME_CONFIG } from "../config/runtime";
import { API_ROUTES, encodedRoute } from "../constants/routes";
import { mockApi } from "../mocks/data";
import {
  getEnvVersion,
  obtainWechatLoginCode,
  request as platformRequest,
  wechatMiniprogramAuthSupported
} from "../platform";
import { getStorageSync, removeStorageSync, setStorageSync } from "../platform/storage";
import type { AuthSession, ClientApi, SearchResponse } from "../types/api";
import { ApiClientError } from "../utils/errors";

const ACCESS_TOKEN_KEY = "microfocus.access-token";
const SESSION_USER_KEY = "microfocus.session-user";
const VIEWER_TOKEN_KEY = "microfocus.viewer-token";
const DEVICE_ID_KEY = "microfocus.device-id";
const VIEWER_SESSION_ID_KEY = "microfocus.viewer-session-id";
let sessionRefreshPromise: Promise<AuthSession> | null = null;
let viewerTokenPromise: Promise<string> | null = null;

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

function resolveHasMore(
  result: { hasMore?: boolean; page?: number; totalPages?: number; items?: unknown[] } | null,
  requestedPage: number
): boolean {
  if (result && typeof result.hasMore === "boolean") return result.hasMore;
  const totalPages = Number(result?.totalPages);
  const page = Number(result?.page) || requestedPage;
  if (Number.isFinite(totalPages) && totalPages > 0) return page < totalPages;
  return false;
}

export function isMockMode(): boolean {
  return getEnvVersion() === "develop" && !RUNTIME_CONFIG.apiBaseUrl.trim();
}

export function getStoredAccessToken(): string {
  try {
    return (getStorageSync<string>(ACCESS_TOKEN_KEY) as string) || "";
  } catch {
    return "";
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    const accessToken = getStoredAccessToken();
    const storedUser = getStorageSync<Record<string, unknown>>(SESSION_USER_KEY);
    if (
      !accessToken ||
      !storedUser ||
      typeof storedUser !== "object" ||
      typeof storedUser.id !== "string" ||
      typeof storedUser.displayName !== "string"
    ) {
      return null;
    }
    return {
      accessToken,
      user: {
        id: storedUser.id,
        displayName: storedUser.displayName,
        avatarUrl: typeof storedUser.avatarUrl === "string" ? storedUser.avatarUrl : null
      }
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
    const existing = getStorageSync<string>(key);
    if (typeof existing === "string" && existing.length >= 8) return existing;
  } catch {
    // continue
  }
  const created = createLocalId(prefix);
  setStorageSync(key, created);
  return created;
}

function getStoredViewerToken(): string {
  try {
    return (getStorageSync<string>(VIEWER_TOKEN_KEY) as string) || "";
  } catch {
    return "";
  }
}

function clearViewerToken(): void {
  removeStorageSync(VIEWER_TOKEN_KEY);
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
    setStorageSync(VIEWER_TOKEN_KEY, session.accessToken);
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
  return typeof body === "object" && body !== null && "data" in body && "requestId" in body;
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
  const response = await platformRequest<T | ApiSuccess<T> | ApiError>({
    url: `${RUNTIME_CONFIG.apiBaseUrl.replace(/\/$/, "")}${path}${queryString}`,
    method,
    data,
    timeout: RUNTIME_CONFIG.requestTimeoutMs,
    header: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders
    }
  });
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
  if (response.statusCode === 401 && retryAuthentication && path !== API_ROUTES.auth.wechat && path !== API_ROUTES.auth.anonymous) {
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
  return isEnvelope(body as T | ApiSuccess<T>) ? (body as ApiSuccess<T>).data : (body as T);
}

const realApi: ClientApi = {
  authWechat: (code) => request<AuthSession>(API_ROUTES.auth.wechat, "POST", { code }),
  authAnonymous: (input) =>
    request<AnonymousSessionResponse>(API_ROUTES.auth.anonymous, "POST", input, undefined, undefined, false),
  getCatalog: () => request(API_ROUTES.catalog),
  search: async (q, category, page) => {
    const result = await request<
      (SearchResponse & { totalPages?: number }) | SearchResponse["items"]
    >(
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
          hasMore: resolveHasMore(result, page)
        };
  },
  getDrama: (id) => request(encodedRoute(API_ROUTES.drama, id)),
  getHistory: () => request(API_ROUTES.history),
  saveProgress: (input) => request<void>(API_ROUTES.progress, "PUT", input),
  getEntitlement: (dramaId) => request(encodedRoute(API_ROUTES.entitlement, dramaId)),
  createRewardChallenge: (input) => request(API_ROUTES.rewardChallenges, "POST", input),
  completeRewardChallenge: (challengeId, input) =>
    request<void>(
      encodedRoute(API_ROUTES.rewardComplete, challengeId),
      "POST",
      input,
      undefined,
      { "Idempotency-Key": `reward-${challengeId}` }
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
      { "Idempotency-Key": `d:${session?.user.id ?? "session"}` }
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
  removeStorageSync(ACCESS_TOKEN_KEY);
  removeStorageSync(SESSION_USER_KEY);
}

function storeSession(session: AuthSession): AuthSession {
  setStorageSync(ACCESS_TOKEN_KEY, session.accessToken);
  setStorageSync(SESSION_USER_KEY, session.user);
  return session;
}

function refreshSession(): Promise<AuthSession> {
  if (sessionRefreshPromise) return sessionRefreshPromise;
  sessionRefreshPromise = (async () => {
    if (!wechatMiniprogramAuthSupported()) {
      if (isMockMode()) {
        return storeSession(await mockApi.authWechat("guest-mock"));
      }
      throw new Error(
        "H5 与 App 不能使用微信小程序登录，也不应调用 /v1/auth/wechat。请使用独立身份（短信/账号）或游客模式。"
      );
    }
    const code = await obtainWechatLoginCode();
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
  clearStoredSession();
  return refreshSession();
}
