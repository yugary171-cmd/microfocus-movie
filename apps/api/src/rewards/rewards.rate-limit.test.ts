import { describe, expect, it, vi } from "vitest";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "@microfocus/contracts";
import { RewardsController } from "./rewards.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function exhaustedBucket() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

describe("reward challenge rate limits", () => {
  it("limits challenge creation by authenticated user, not a client field", async () => {
    expect(RATE_LIMITS.rewardChallenge).toEqual({ limit: 3, windowMs: 5 * 60_000 });
    expect(RATE_LIMITS.rewardComplete).toEqual({ limit: 20, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: exhaustedBucket(),
      circuitBreaker: { findFirst: vi.fn() },
      drama: { findFirst: vi.fn() },
      rewardChallenge: { count: vi.fn(), create: vi.fn() }
    };
    const controller = new RewardsController(prisma as never, {
      env: { WECHAT_REWARDED_AD_UNIT_ID: "ad-unit", WECHAT_REWARD_VERIFICATION: "mock" },
      clientAttestationAllowed: true
    } as never);

    await expect(
      controller.create({ kind: "user", sub: "user-1" } as never, {
        dramaId: "drama-1",
        sessionId: "session-1"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("rewardChallenge", "user:user-1")
        })
      })
    );
    expect(prisma.circuitBreaker.findFirst).not.toHaveBeenCalled();
    expect(prisma.rewardChallenge.count).not.toHaveBeenCalled();
  });

  it("limits challenge completion after a valid idempotency key", async () => {
    const prisma = {
      rateLimitBucket: exhaustedBucket(),
      $transaction: vi.fn()
    };
    const controller = new RewardsController(prisma as never, {
      env: { WECHAT_REWARDED_AD_UNIT_ID: "ad-unit" }
    } as never);

    await expect(
      controller.complete({ kind: "user", sub: "user-1" } as never, "challenge-1", undefined, {
        nonce: "n",
        isEnded: true,
        clientCompletedAt: "2026-08-14T12:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();

    await expect(
      controller.complete({ kind: "user", sub: "user-1" } as never, "challenge-1", "complete-1", {
        nonce: "n",
        isEnded: true,
        clientCompletedAt: "2026-08-14T12:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("rewardComplete", "user:user-1")
        })
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects blank or oversized completion keys before the rate-limit bucket", async () => {
    const prisma = {
      rateLimitBucket: exhaustedBucket(),
      $transaction: vi.fn()
    };
    const controller = new RewardsController(prisma as never, {
      env: { WECHAT_REWARDED_AD_UNIT_ID: "ad-unit" }
    } as never);
    const body = {
      nonce: "n",
      isEnded: true as const,
      clientCompletedAt: "2026-08-14T12:00:00.000Z"
    };

    await expect(
      controller.complete({ kind: "user", sub: "user-1" } as never, "challenge-1", "   ", body)
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    await expect(
      controller.complete(
        { kind: "user", sub: "user-1" } as never,
        "challenge-1",
        "x".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1),
        body
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();

    await expect(
      controller.complete(
        { kind: "user", sub: "user-1" } as never,
        "challenge-1",
        `  ${"k".repeat(IDEMPOTENCY_KEY_MAX_LENGTH)}  `,
        body
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalled();
  });
});
