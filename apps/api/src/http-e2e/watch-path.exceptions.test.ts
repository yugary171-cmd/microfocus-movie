import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { REWARD_SECONDS } from "@microfocus/contracts";
import { EntitlementsController } from "../entitlements/entitlements.module.js";
import { PlaybackController } from "../playback/playback.module.js";
import { RewardsController } from "../rewards/rewards.module.js";

const principal = { kind: "user", sub: "user-1" } as const;

function rateLimitOk() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

describe("watch-path HTTP exception handlers", () => {
  it("does not grant when the rewarded ad was not completed", async () => {
    const prisma = { rateLimitBucket: rateLimitOk(), $transaction: vi.fn() };
    const controller = new RewardsController(prisma as never, {
      env: { WECHAT_REWARDED_AD_UNIT_ID: "ad-unit" }
    } as never);
    await expect(
      controller.complete(principal as never, "challenge-1", "complete-1", {
        nonce: "n",
        isEnded: false as never,
        clientCompletedAt: "2026-08-15T12:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "AD_NOT_COMPLETED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not grant when server verification is still pending", async () => {
    const nonce = "n";
    const tx = {
      $queryRaw: vi.fn(),
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) },
      rewardChallenge: {
        findFirst: vi.fn().mockResolvedValue({
          id: "challenge-1",
          userId: "user-1",
          dramaId: "drama-1",
          status: "PENDING",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          nonceHash: createHash("sha256").update(nonce).digest("hex"),
          verificationMode: "server_verified",
          verifiedAt: null,
          grant: null
        }),
        update: vi.fn()
      },
      entitlementGrant: { create: vi.fn() },
      operationalEvent: { create: vi.fn() }
    };
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const controller = new RewardsController(prisma as never, {
      env: { WECHAT_REWARDED_AD_UNIT_ID: "ad-unit" }
    } as never);
    await expect(
      controller.complete(principal as never, "challenge-1", "complete-1", {
        nonce,
        isEnded: true,
        clientCompletedAt: "2026-08-15T12:00:00.000Z"
      })
    ).rejects.toMatchObject({ code: "REWARD_NOT_VERIFIED" });
    expect(tx.entitlementGrant.create).not.toHaveBeenCalled();
  });

  it("returns credited remaining seconds after a live grant", async () => {
    const expiresAt = new Date("2026-08-16T12:00:00.000Z");
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      entitlementGrant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "grant-1",
            grantedSeconds: REWARD_SECONDS,
            remainingSeconds: REWARD_SECONDS,
            grantedAt: new Date("2026-08-15T12:00:00.000Z"),
            expiresAt,
            source: "REWARDED_AD"
          }
        ])
      }
    };
    const controller = new EntitlementsController(prisma as never);
    await expect(controller.summary(principal as never, "drama-1")).resolves.toMatchObject({
      dramaId: "drama-1",
      remainingSeconds: REWARD_SECONDS,
      nearestExpiresAt: expiresAt.toISOString()
    });
  });

  it("requires WeChat reauth before playback recovery", async () => {
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      playbackLease: {
        findFirst: vi.fn().mockResolvedValue({ id: "lease-1", userId: "user-1" })
      },
      $transaction: vi.fn()
    };
    const controller = new PlaybackController(
      prisma as never,
      {} as never,
      { exchangeCode: vi.fn() } as never,
      { env: { WECHAT_MODE: "live" }, signPlaybackToken: vi.fn() } as never
    );
    await expect(
      controller.recover(principal as never, "lease-1", {
        deviceId: "device-1234",
        reason: "resume",
        wechatCode: ""
      })
    ).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
