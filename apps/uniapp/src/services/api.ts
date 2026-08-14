import type { ApiError, ApiSuccess } from "@microfocus/contracts";
import { RUNTIME_CONFIG } from "../config/runtime";
import { API_ROUTES } from "../constants/routes";
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
let sessionRefreshPromise: Promise<AuthSession> | null = null;

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
  const token = getStoredAccessToken();
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
  if (response.statusCode === 401 && retryAuthentication && path !== API_ROUTES.authWechat) {
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
  authWechat: (code) => request<AuthSession>(API_ROUTES.authWechat, "POST", { code }),
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
  getDrama: (id) => request(API_ROUTES.drama(id)),
  getHistory: () => request(API_ROUTES.history),
  saveProgress: (input) => request<void>(API_ROUTES.progress, "PUT", input),
  getEntitlement: (dramaId) => request(API_ROUTES.entitlement(dramaId)),
  createRewardChallenge: (input) => request(API_ROUTES.rewardChallenges, "POST", input),
  completeRewardChallenge: (challengeId, input) =>
    request<void>(
      API_ROUTES.completeReward(challengeId),
      "POST",
      input,
      undefined,
      { "Idempotency-Key": `reward-${challengeId}` }
    ),
  createPlaybackLease: (input) => request(API_ROUTES.playbackLeases, "POST", input),
  heartbeat: (leaseId, input) => request(API_ROUTES.heartbeat(leaseId), "POST", input),
  renewPlaybackLease: (leaseId) => request(API_ROUTES.renewLease(leaseId), "POST"),
  closePlaybackLease: (leaseId) => request(API_ROUTES.closeLease(leaseId), "DELETE")
};

export function getApi(): ClientApi {
  return isMockMode() ? mockApi : realApi;
}

function clearStoredSession(): void {
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
      API_ROUTES.authWechat,
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
