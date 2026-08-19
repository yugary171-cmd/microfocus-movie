import type { ApiError, ApiSuccess } from "@microfocus/contracts";
import { isAdminSessionInvalidCode } from "./account-errors";

const SESSION_TOKEN_KEY = "microfocus.admin.access-token";

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
  return sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function setSessionToken(token: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isMockMode) {
    throw new ApiClientError("Mock 请求必须由管理端适配器处理", { code: "MOCK_ADAPTER_MISSING" });
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiClientError("无法连接管理服务，请检查网络或 API 配置", {
      code: "NETWORK_ERROR",
    });
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
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

  return isApiSuccess<T>(payload) ? payload.data : (payload as T);
}
