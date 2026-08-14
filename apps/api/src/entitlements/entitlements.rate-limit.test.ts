import { describe, expect, it, vi } from "vitest";
import { EntitlementsController } from "./entitlements.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

describe("entitlement summary rate limits", () => {
  it("limits summary reads by authenticated user", async () => {
    expect(RATE_LIMITS.entitlementSummary).toEqual({ limit: 60, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      entitlementGrant: { findMany: vi.fn() }
    };
    const controller = new EntitlementsController(prisma as never);
    await expect(
      controller.summary({ kind: "user", sub: "user-1" } as never, "drama-1")
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("entitlementSummary", "user:user-1")
        })
      })
    );
    expect(prisma.entitlementGrant.findMany).not.toHaveBeenCalled();
  });
});
