import type { ApiError, ApiSuccess } from "@microfocus/contracts";
import { RUNTIME_CONFIG } from "../config/runtime";
import { API_ROUTES } from "../constants/routes";
import { mockApi } from "../mocks/data";
import type { AuthSession, ClientApi, SearchResponse } from "../types/api";
import { ApiClientError } from "../utils/errors";
import { wechatAdapter } from "./wechat-adapter";

const ACCESS_TOKEN_KEY = "microfocus.access-token";
const SESSION_USER_KEY = "microfocus.session-user";
let sessionRefreshPromise: Promise<AuthSession> | null = null;

interface RequestResponse<T> {
  data: T | ApiSuccess<T> | ApiError;
  statusCode: number;
  header: Record<string, string>;
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

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
    if (
      !accessToken ||
      !storedUser ||
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
  const token = getStoredAccessToken();
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
  });
  const body = response.data;
  if (
    response.statusCode === 401 &&
    retryAuthentication &&
    path !== API_ROUTES.authWechat
  ) {
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
  authWechat: (code) => request<AuthSession>(API_ROUTES.authWechat, "POST", { code }),
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
  wx.removeStorageSync(ACCESS_TOKEN_KEY);
  wx.removeStorageSync(SESSION_USER_KEY);
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
  // This is an explicit user-login action, not a silent session lookup. Always
  // request a fresh WeChat code before creating the application session.
  clearStoredSession();
  return refreshSession();
}
