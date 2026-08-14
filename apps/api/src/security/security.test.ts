import { describe, expect, it } from "vitest";
import { AdminRole, ERROR_CODES } from "@microfocus/contracts";
import { parsePrincipal } from "./security.js";
import { JwtAuthGuard } from "./security.js";

describe("principal parsing", () => {
  it("keeps user, viewer, and admin tokens distinct", () => {
    expect(parsePrincipal({ kind: "user", sub: "user-1" })).toEqual({
      kind: "user",
      sub: "user-1"
    });
    expect(parsePrincipal({ kind: "viewer", sub: "viewer-1", deviceId: "device-1" })).toEqual({
      kind: "viewer",
      sub: "viewer-1",
      deviceId: "device-1"
    });
    expect(parsePrincipal({ kind: "admin", sub: "admin-1", role: AdminRole.ADMIN })).toEqual({
      kind: "admin",
      sub: "admin-1",
      role: AdminRole.ADMIN
    });
  });

  it("rejects viewer tokens without a device binding", () => {
    expect(() => parsePrincipal({ kind: "viewer", sub: "viewer-1" })).toThrow(
      /Invalid or expired access token/
    );
  });
});

describe("jwt auth guard", () => {
  it("maps expired viewer tokens to ANONYMOUS_SESSION_EXPIRED", async () => {
    const jwt = {
      verifyAsync: async () => {
        const error = new Error("jwt expired");
        error.name = "TokenExpiredError";
        throw error;
      },
      decode: () => ({ kind: "viewer", sub: "viewer-1", deviceId: "device-1" })
    };
    const guard = new JwtAuthGuard(jwt as never);
    const request = { header: () => "Bearer expired-token" };

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request })
      } as never)
    ).rejects.toMatchObject({ code: ERROR_CODES.ANONYMOUS_SESSION_EXPIRED });
  });

  it("rejects user tokens after account deletion is pending", async () => {
    const jwt = {
      verifyAsync: async () => ({ kind: "user", sub: "user-1" }),
      decode: () => ({ kind: "user", sub: "user-1" })
    };
    const prisma = {
      user: { findUnique: async () => ({ status: "DELETION_PENDING" }) }
    };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    const request = { header: () => "Bearer user-token" };

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request })
      } as never)
    ).rejects.toMatchObject({ code: ERROR_CODES.ACCOUNT_UNAVAILABLE });
  });
});
