import { AdminRole } from "@microfocus/contracts";
import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.module.js";

function rateLimitBucket() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

describe("administrator login", () => {
  it("issues a session-versioned JWT and updates the last login time", async () => {
    const passwordHash = await hash("correct-horse-battery", 4);
    const admin = {
      id: "admin-1",
      email: "admin@example.com",
      displayName: "系统管理员",
      passwordHash,
      role: AdminRole.ADMIN,
      active: true,
      setupCompletedAt: new Date(),
      sessionVersion: 5,
      totpEnabled: true,
      totpSecretEncrypted: "encrypted-secret"
    };
    const prisma = {
      rateLimitBucket: rateLimitBucket(),
      adminUser: {
        findUnique: vi.fn().mockResolvedValue(admin),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("admin-jwt") };
    const totp = { verifyAdminOtp: vi.fn().mockReturnValue(true) };
    const sessions = {
      issue: vi.fn().mockResolvedValue({
        response: {
          accessToken: "admin-jwt",
          accessTokenExpiresAt: "2026-08-21T13:00:00.000Z",
          admin: {
            id: admin.id,
            email: admin.email,
            displayName: admin.displayName,
            role: AdminRole.ADMIN,
          },
        },
        refreshToken: "refresh-token",
      }),
      cookieOptions: vi.fn().mockReturnValue({ secure: false, sameSite: "lax" }),
      refreshTtlSeconds: vi.fn().mockReturnValue(2_592_000),
    };
    const controller = new AuthController(
      prisma as never,
      jwt as never,
      {} as never,
      totp as never,
      sessions as never
    );
    const response = { setHeader: vi.fn() };

    const result = await controller.adminLogin(
      { socket: { remoteAddress: "10.0.0.1" } },
      { email: " ADMIN@example.com ", password: "correct-horse-battery", otp: "123456" },
      response
    );

    expect(result).toEqual({
      accessToken: "admin-jwt",
      accessTokenExpiresAt: "2026-08-21T13:00:00.000Z",
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: AdminRole.ADMIN
      }
    });
    expect(sessions.issue).toHaveBeenCalledWith(expect.objectContaining({ id: admin.id, sessionVersion: 5 }));
    expect(response.setHeader).toHaveBeenCalledWith("Set-Cookie", expect.stringContaining("HttpOnly"));
    expect(prisma.adminUser.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: admin.id, sessionVersion: 5 }),
        data: { lastLoginAt: expect.any(Date) }
      })
    );
  });

  it("does not allow pending setup accounts to log in", async () => {
    const prisma = {
      rateLimitBucket: rateLimitBucket(),
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({
          active: true,
          setupCompletedAt: null,
          passwordHash: null
        }),
        updateMany: vi.fn()
      }
    };
    const controller = new AuthController(
      prisma as never,
      { signAsync: vi.fn() } as never,
      {} as never,
      { verifyAdminOtp: vi.fn() } as never,
      { issue: vi.fn() } as never
    );
    await expect(
      controller.adminLogin(
        { socket: { remoteAddress: "10.0.0.1" } },
        { email: "pending@example.com", password: "pending-password", otp: "123456" }
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(prisma.adminUser.updateMany).not.toHaveBeenCalled();
  });
});
