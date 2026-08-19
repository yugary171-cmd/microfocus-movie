import { ERROR_CODES } from "@microfocus/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("admin API client session handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    sessionStorage.setItem("microfocus.admin.access-token", "keep-me");
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
    const { request } = await import("./client");

    await expect(request("/v1/admin/accounts")).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_OTP_INVALID,
    });
    expect(sessionStorage.getItem("microfocus.admin.access-token")).toBe("keep-me");
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
    const { request } = await import("./client");

    await expect(request("/v1/admin/dashboard")).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_SESSION_INVALID,
    });
    expect(sessionStorage.getItem("microfocus.admin.access-token")).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener("admin:unauthorized", unauthorized);
  });
});
