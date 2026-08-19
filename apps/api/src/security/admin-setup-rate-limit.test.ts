import { describe, expect, it, vi } from "vitest";
import { rateLimitBucketId } from "./rate-limit.js";
import {
  AdminSetupRateLimitGuard,
  adminSetupRateLimitKeys
} from "./admin-setup-rate-limit.js";

function context(request: object) {
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

describe("public administrator setup rate limit", () => {
  it("keys requests by IP and a token digest without storing the raw token", async () => {
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    const token = "sensitive-one-time-token";
    const request = { method: "POST", ip: "10.0.0.9", body: { token } };
    const guard = new AdminSetupRateLimitGuard(prisma as never);

    await expect(guard.canActivate(context(request) as never)).resolves.toBe(true);
    const keys = adminSetupRateLimitKeys(request, token);
    expect(keys.token).not.toContain(token);
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: rateLimitBucketId("adminSetup", keys.ip) })
      })
    );
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: rateLimitBucketId("adminSetup", keys.token) })
      })
    );
  });

  it("skips CORS preflight", async () => {
    const prisma = { rateLimitBucket: { updateMany: vi.fn() } };
    const guard = new AdminSetupRateLimitGuard(prisma as never);
    await expect(
      guard.canActivate(context({ method: "OPTIONS" }) as never)
    ).resolves.toBe(true);
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();
  });
});
