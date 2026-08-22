import { AdminRole, API_ROUTES } from "@microfocus/contracts";
import type { ApiError, ApiSuccess } from "@microfocus/contracts";
import type { AdminUser } from "@/shared/types";
import { isAdminSessionInvalidCode } from "./account-errors";

const SESSION_TOKEN_KEY = "microfocus.admin.access-token";
const SESSION_USER_KEY = "microfocus.admin.user";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export const isMockMode = apiBaseUrl.length === 0;

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;

  constructor(message: string, options?: { code?: string; requestId?: string; status?: number }) {
    super(message);
    this.name = "ApiClientError";
    this.code = options?.code ?? "UNKNOWN_ERROR";
    this.requestId = options?.requestId ?? "local";
    this.status = options?.status ?? 0;
  }
}

export function getSessionToken(): string | null {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  return accessToken;
}

export function getSessionUser(): AdminUser | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) ?? "null") as Partial<AdminUser> | null;
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      typeof value.email !== "string" ||
      !Object.values(AdminRole).includes(value.role as AdminRole)
    ) return null;
    return value as AdminUser;
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  accessToken = token;
}

export function clearSessionToken(): void {
  accessToken = null;
}

export function setSessionUser(user: AdminUser): void {
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.requestId === "local"
      ? error.message
      : `${error.message}（请求 ${error.requestId}）`;
  }
  if (error instanceof Error) return error.message;
  return "请求失败，请稍后重试";
}

function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return Boolean(value && typeof value === "object" && "data" in value);
}

function isApiError(value: unknown): value is ApiError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      "message" in value &&
      "requestId" in value,
  );
}

type RequestOptions = { skipAuthRefresh?: boolean };

function isRefreshableUnauthorized(path: string, payload: unknown, options: RequestOptions): boolean {
  if (options.skipAuthRefresh) return false;
  if (
    path === API_ROUTES.admin.login ||
    path === API_ROUTES.admin.refresh ||
    path === API_ROUTES.admin.logout
  ) return false;
  return !isApiError(payload) || payload.code === "UNAUTHORIZED";
}

function refreshedSession(value: unknown): { accessToken: string; user: AdminUser } | null {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const admin = source.admin && typeof source.admin === "object" && !Array.isArray(source.admin)
    ? source.admin as Record<string, unknown>
    : {};
  const accessTokenValue = typeof source.accessToken === "string" ? source.accessToken : "";
  const id = typeof admin.id === "string" ? admin.id : "";
  const email = typeof admin.email === "string" ? admin.email : "";
  const displayName = typeof admin.displayName === "string" ? admin.displayName : email;
  const role = admin.role;
  if (!accessTokenValue || !id || !email || !displayName || !Object.values(AdminRole).includes(role as AdminRole)) {
    return null;
  }
  return {
    accessToken: accessTokenValue,
    user: { id, email, name: displayName, role: role as AdminRole },
  };
}

async function refreshAccessToken(): Promise<boolean> {
  if (isMockMode) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}${API_ROUTES.admin.refresh}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return false;
      const data = isApiSuccess<unknown>(payload) ? payload.data : payload;
      const session = refreshedSession(data);
      if (!session) return false;
      setSessionToken(session.accessToken);
      setSessionUser(session.user);
      window.dispatchEvent(new CustomEvent("admin:session-refreshed"));
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  if (isMockMode) {
    throw new ApiClientError("Mock 请求必须由管理端适配器处理", { code: "MOCK_ADAPTER_MISSING" });
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let attemptedRefresh = false;
  while (true) {
    headers.delete("Authorization");
    const token = getSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiClientError("无法连接管理服务，请检查网络或 API 配置", {
        code: "NETWORK_ERROR",
      });
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (response.ok) return isApiSuccess<T>(payload) ? payload.data : (payload as T);

    if (
      response.status === 401 &&
      !attemptedRefresh &&
      Boolean(token) &&
      isRefreshableUnauthorized(path, payload, options) &&
      await refreshAccessToken()
    ) {
      attemptedRefresh = true;
      continue;
    }

    if (response.status === 401 && (!isApiError(payload) || isAdminSessionInvalidCode(payload.code))) {
      clearSessionToken();
      window.dispatchEvent(new CustomEvent("admin:unauthorized"));
    }
    if (isApiError(payload)) {
      throw new ApiClientError(payload.message, {
        code: payload.code,
        requestId: payload.requestId,
        status: response.status,
      });
    }
    throw new ApiClientError(`请求失败（HTTP ${response.status}）`, {
      code: "HTTP_ERROR",
      status: response.status,
    });
  }
}
