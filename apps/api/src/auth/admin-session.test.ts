import { AdminRole, ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminSessionService, digestOpaqueToken } from "./admin-session.js";

function config() {
  return {
    env: {
      NODE_ENV: "development",
      ADMIN_ACCESS_TOKEN_TTL_SECONDS: 900,
      ADMIN_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
      ADMIN_REFRESH_COOKIE_SAME_SITE: "lax",
      ADMIN_ORIGIN: "http://localhost:5174",
    },
  };
}

function admin() {
  return {
    id: "admin-1",
    email: "admin@example.com",
    displayName: "系统管理员",
    role: AdminRole.ADMIN,
    active: true,
    setupCompletedAt: new Date("2026-08-01T00:00:00.000Z"),
    sessionVersion: 3,
  };
}

describe("AdminSessionService", () => {
  it("creates a refresh session without returning the raw refresh token in the response", async () => {
    const prisma = { adminRefreshSession: { create: vi.fn() } };
    const jwt = { signAsync: vi.fn().mockResolvedValue("access-token") };
    const service = new AdminSessionService(prisma as never, jwt as never, config() as never);

    const issued = await service.issue(admin(), new Date("2026-08-21T12:00:00.000Z"));

    expect(issued.response).toMatchObject({
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-08-21T12:15:00.000Z",
      admin: { id: "admin-1", role: AdminRole.ADMIN },
    });
    expect(issued.response).not.toHaveProperty("refreshToken");
    expect(prisma.adminRefreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        sessionVersion: 3,
        tokenDigest: digestOpaqueToken(issued.refreshToken),
      }),
    });
  });

  it("revokes a refresh family when a rotated token is replayed", async () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    const token = "replayed-refresh-token";
    const tx = {
      $queryRaw: vi.fn(),
      adminRefreshSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "refresh-1",
          familyId: "family-1",
          revokedAt: new Date("2026-08-21T11:59:00.000Z"),
          expiresAt: new Date("2026-09-20T12:00:00.000Z"),
          adminUser: admin(),
        }),
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AdminSessionService(
      prisma as never,
      { signAsync: vi.fn() } as never,
      config() as never,
    );

    await expect(service.rotate(token, now)).rejects.toMatchObject({
      code: ERROR_CODES.ADMIN_REFRESH_INVALID,
    });
    expect(tx.adminRefreshSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1", revokedAt: null },
      data: { revokedAt: now },
    });
  });
});
