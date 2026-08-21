import { ERROR_CODES } from "@microfocus/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("admin API client session handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("keeps the current session when a sensitive action OTP is wrong", async () => {
    const unauthorized = vi.fn();
    window.addEventListener("admin:unauthorized", unauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: ERROR_CODES.ADMIN_OTP_INVALID,
          message: "Invalid administrator one-time password",
          requestId: "otp-1",
        }),
      }),
    );
    const { request, setSessionToken, getSessionToken } = await import("./client");
    setSessionToken("keep-me");

    await expect(request("/v1/admin/accounts")).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_OTP_INVALID,
    });
    expect(getSessionToken()).toBe("keep-me");
    expect(unauthorized).not.toHaveBeenCalled();
    window.removeEventListener("admin:unauthorized", unauthorized);
  });

  it("clears the session only for invalid administrator authentication", async () => {
    const unauthorized = vi.fn();
    window.addEventListener("admin:unauthorized", unauthorized);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: ERROR_CODES.ADMIN_SESSION_INVALID,
          message: "Administrator session is no longer valid",
          requestId: "session-1",
        }),
      }),
    );
    const { request, setSessionToken, getSessionToken } = await import("./client");
    setSessionToken("keep-me");

    await expect(request("/v1/admin/dashboard")).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
    });
    expect(getSessionToken()).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener("admin:unauthorized", unauthorized);
  });

  it("refreshes an expired access token once and retries the original request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: "UNAUTHORIZED", message: "expired", requestId: "expired-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            accessToken: "refreshed-token",
            accessTokenExpiresAt: "2026-08-21T13:15:00.000Z",
            admin: { id: "admin-1", displayName: "系统管理员", email: "admin@example.com", role: "ADMIN" },
          },
          requestId: "refresh-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { ok: true }, requestId: "retry-1" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { request, setSessionToken, getSessionToken } = await import("./client");
    setSessionToken("expired-token");

    await expect(request<{ ok: boolean }>("/v1/admin/dashboard")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://api.test/v1/admin/auth/refresh");
    const retryHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer refreshed-token");
    expect(getSessionToken()).toBe("refreshed-token");
  });
});
