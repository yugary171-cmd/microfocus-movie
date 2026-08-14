import { describe, expect, it, vi } from "vitest";
import { AdminRole } from "@microfocus/contracts";
import {
  AdminWriteRateLimitGuard,
  adminWriteRateLimitKey,
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
    expect(adminWriteRateLimitKey("admin-1")).toBe("admin:admin-1");
  });

  it("does not consume a write bucket for dashboard reads", async () => {
    const prisma = { rateLimitBucket: { updateMany: vi.fn() } };
    const guard = new AdminWriteRateLimitGuard(prisma as never);
    await expect(
      guard.canActivate(context({ method: "GET", principal: { kind: "admin", sub: "admin-1" } }) as never)
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
