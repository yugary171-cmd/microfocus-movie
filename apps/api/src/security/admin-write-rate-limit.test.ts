import { describe, expect, it, vi } from "vitest";
import { AdminRole, RATE_LIMIT_CLIENT_KEY_MAX_LENGTH } from "@microfocus/contracts";
import { RATE_LIMITS, rateLimitBucketId } from "./rate-limit.js";
import {
  AdminWriteRateLimitGuard,
  adminWriteRateLimitKey,
  isAdminReadMethod,
  isAdminWriteMethod
} from "./admin-write-rate-limit.js";

function context(input: { method: string; principal?: { kind: string; sub: string; role?: AdminRole } }) {
  const request = { method: input.method, principal: input.principal };
  return {
    switchToHttp: () => ({ getRequest: () => request })
  };
}

describe("admin write rate limits", () => {
  it("keys writes by the authenticated administrator, not a client field", () => {
    expect(isAdminWriteMethod("GET")).toBe(false);
    expect(isAdminWriteMethod("POST")).toBe(true);
    expect(isAdminReadMethod("GET")).toBe(true);
    expect(isAdminReadMethod("HEAD")).toBe(true);
    expect(isAdminReadMethod("POST")).toBe(false);
    expect(adminWriteRateLimitKey("admin-1")).toBe("admin:admin-1");
    expect(
      adminWriteRateLimitKey("a".repeat(RATE_LIMIT_CLIENT_KEY_MAX_LENGTH + 8))
    ).toBe(`admin:${"a".repeat(RATE_LIMIT_CLIENT_KEY_MAX_LENGTH)}`);
    expect(RATE_LIMITS.adminRead).toEqual({ limit: 60, windowMs: 60_000 });
  });

  it("rate-limits dashboard reads per administrator without consuming the write bucket", async () => {
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    const guard = new AdminWriteRateLimitGuard(prisma as never);
    await expect(
      guard.canActivate(context({ method: "GET", principal: { kind: "admin", sub: "admin-1" } }) as never)
    ).resolves.toBe(true);
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("adminRead", "admin:admin-1")
        })
      })
    );
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("adminWrite", "admin:admin-1")
        })
      })
    );
  });

  it("skips CORS preflight without consuming a bucket", async () => {
    const prisma = { rateLimitBucket: { updateMany: vi.fn() } };
    const guard = new AdminWriteRateLimitGuard(prisma as never);
    await expect(
      guard.canActivate(context({ method: "OPTIONS", principal: { kind: "admin", sub: "admin-1" } }) as never)
    ).resolves.toBe(true);
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();
  });

  it("rate limits publish and other writes per administrator", async () => {
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    const guard = new AdminWriteRateLimitGuard(prisma as never);
    await expect(
      guard.canActivate(
        context({
          method: "POST",
          principal: { kind: "admin", sub: "admin-1", role: AdminRole.ADMIN }
        }) as never
      )
    ).resolves.toBe(true);
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.stringMatching(/^adminWrite:/)
        })
      })
    );
  });
});
