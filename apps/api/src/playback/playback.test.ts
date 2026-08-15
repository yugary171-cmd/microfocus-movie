import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES, REWARD_SECONDS, UNCONFIRMED_EXPOSURE_LIMIT } from "@microfocus/contracts";
import { PlaybackController } from "./playback.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function allowRateLimit() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

function createController(prisma: unknown) {
  return new PlaybackController(
    prisma as never,
    {} as never,
    { exchangeCode: vi.fn() } as never,
    { env: { WECHAT_MODE: "mock" } } as never
  );
}

function readyAsset() {
  return {
    fileId: "file",
    mediaStatus: "READY",
    transcodeStatus: "READY",
    machineReviewStatus: "APPROVED",
    manualReviewStatus: "APPROVED",
    wechatReviewStatus: "APPROVED"
  };
}

describe("playback renewal", () => {
  it("closes a paid lease whose entitlement balance is zero", async () => {
    const now = Date.now();
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) },
      rateLimitBucket: allowRateLimit(),
      playbackLease: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lease",
          episodeId: "episode",
          userId: "user",
          status: "ACTIVE",
          lastSeq: 1,
          lastHeartbeatAt: new Date(now),
          episode: {
            episodeNumber: 3,
            dramaId: "drama",
            drama: {
              status: "PUBLISHED",
              rightsRecords: [
                {
                  validFrom: new Date(now - 1_000),
                  validUntil: new Date(now + 60_000)
                }
              ]
            },
            mediaAssets: [readyAsset()]
          }
        }),
        updateMany,
        update: vi.fn()
      },
      entitlementGrant: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { remainingSeconds: null } })
      },
      playbackReservation: {
        findMany: vi.fn().mockResolvedValue([])
      }
    };
    const controller = createController(prisma);

    await expect(
      controller.renew({ kind: "user", sub: "user" }, "lease")
    ).rejects.toMatchObject({ code: "ENTITLEMENT_REQUIRED" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CLOSED", activeKey: null })
      })
    );
  });

  it("refuses locked-episode leases for anonymous viewers", async () => {
    const prisma = {
      episode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "episode-3",
          episodeNumber: 3,
          dramaId: "drama",
          drama: {
            status: "PUBLISHED",
            rightsRecords: [
              { validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 60_000) }
            ]
          },
          mediaAssets: [readyAsset()]
        })
      },
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) },
      rateLimitBucket: allowRateLimit()
    };
    const controller = createController(prisma);

    await expect(
      controller.create(
        { kind: "viewer", sub: "viewer-1", deviceId: "device-1" },
        { episodeId: "episode-3", deviceId: "device-1" }
      )
    ).rejects.toMatchObject({ code: "USER_TOKEN_REQUIRED" });
  });

  it("refuses a new locked lease when unconfirmed exposure is at the limit", async () => {
    const prisma = {
      episode: {
        findUnique: vi.fn().mockResolvedValue({
          id: "episode-3",
          episodeNumber: 3,
          dramaId: "drama",
          drama: {
            status: "PUBLISHED",
            rightsRecords: [
              { validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 60_000) }
            ]
          },
          mediaAssets: [readyAsset()]
        })
      },
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) },
      entitlementGrant: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { remainingSeconds: REWARD_SECONDS } })
      },
      playbackReservation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(UNCONFIRMED_EXPOSURE_LIMIT)
      },
      rateLimitBucket: allowRateLimit()
    };
    const controller = createController(prisma);

    await expect(
      controller.create(
        { kind: "user", sub: "user" },
        { episodeId: "episode-3", deviceId: "device-1" }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.UNCONFIRMED_EXPOSURE_LIMIT });
  });

  it("does not debit a playing heartbeat while unconfirmed windows lack VOD delivery logs", async () => {
    const now = Date.now();
    const entitlementDebit = { create: vi.fn() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      playbackLease: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lease",
          episodeId: "episode-3",
          userId: "user",
          status: "ACTIVE",
          lastSeq: 1,
          lastMediaPosition: 10,
          lastHeartbeatAt: new Date(now),
          updatedAt: new Date(now),
          episode: {
            episodeNumber: 3,
            dramaId: "drama",
            drama: {
              status: "PUBLISHED",
              rightsRecords: [
                { validFrom: new Date(now - 1_000), validUntil: new Date(now + 60_000) }
              ]
            },
            mediaAssets: [readyAsset()]
          }
        }),
        update: vi.fn()
      },
      playbackHeartbeat: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "hb-2" }),
        update: vi.fn()
      },
      playbackReservation: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn()
      },
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) },
      entitlementGrant: {
        findMany: vi.fn().mockResolvedValue([
          { id: "grant", remainingSeconds: REWARD_SECONDS, expiresAt: new Date(now + 60_000) }
        ]),
        updateMany: vi.fn()
      },
      entitlementDebit
    };
    const prisma = {
      rateLimitBucket: allowRateLimit(),
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    };
    const controller = createController(prisma);

    await expect(
      controller.heartbeat(
        { kind: "user", sub: "user" },
        "lease",
        {
          seq: 2,
          mediaPositionSeconds: 15,
          previousMediaPositionSeconds: 10,
          playbackRate: 1,
          state: "playing"
        }
      )
    ).resolves.toMatchObject({
      debitedSeconds: 0,
      mayContinue: false,
      reason: "UNCONFIRMED_EXPOSURE"
    });
    expect(entitlementDebit.create).not.toHaveBeenCalled();
    expect(tx.entitlementGrant.updateMany).not.toHaveBeenCalled();
  });

  it("rate-limits heartbeats and renewals by authenticated actor", async () => {
    expect(RATE_LIMITS.playbackHeartbeat).toEqual({ limit: 60, windowMs: 60_000 });
    expect(RATE_LIMITS.playbackRenew).toEqual({ limit: 20, windowMs: 60_000 });
    const exhausted = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
      create: vi.fn(),
      deleteMany: vi.fn()
    };
    const prisma = {
      rateLimitBucket: exhausted,
      $transaction: vi.fn(),
      playbackLease: { findFirst: vi.fn() }
    };
    const controller = createController(prisma);
    const principal = { kind: "user" as const, sub: "user-1" };

    await expect(
      controller.heartbeat(principal, "lease", {
        seq: 2,
        mediaPositionSeconds: 15,
        previousMediaPositionSeconds: 10,
        playbackRate: 1,
        state: "playing"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(exhausted.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("playbackHeartbeat", "user:user-1")
        })
      })
    );

    await expect(controller.renew(principal, "lease")).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(prisma.playbackLease.findFirst).not.toHaveBeenCalled();
    expect(exhausted.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("playbackRenew", "user:user-1")
        })
      })
    );
  });

  it("rate-limits recover before WeChat reauth and close before the lease transaction", async () => {
    expect(RATE_LIMITS.playbackRecover).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.playbackClose).toEqual({ limit: 20, windowMs: 60_000 });
    const exhausted = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
      create: vi.fn(),
      deleteMany: vi.fn()
    };
    const exchangeCode = vi.fn();
    const prisma = {
      rateLimitBucket: exhausted,
      $transaction: vi.fn(),
      playbackLease: { findFirst: vi.fn() }
    };
    const controller = new PlaybackController(
      prisma as never,
      {} as never,
      { exchangeCode } as never,
      { env: { WECHAT_MODE: "mock" } } as never
    );
    const principal = { kind: "user" as const, sub: "user-1" };

    await expect(
      controller.recover(principal, "lease", {
        reason: "offline",
        deviceId: "device-1",
        wechatCode: "code-1"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.playbackLease.findFirst).not.toHaveBeenCalled();
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(exhausted.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("playbackRecover", "user:user-1")
        })
      })
    );

    await expect(controller.close(principal, "lease")).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(exhausted.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("playbackClose", "user:user-1")
        })
      })
    );
  });

  it("rate-limits active lease reads by authenticated user", async () => {
    expect(RATE_LIMITS.playbackActive).toEqual({ limit: 30, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      playbackLease: { findFirst: vi.fn() }
    };
    const controller = createController(prisma);
    await expect(controller.active({ kind: "user", sub: "user-1" })).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("playbackActive", "user:user-1")
        })
      })
    );
    expect(prisma.playbackLease.findFirst).not.toHaveBeenCalled();
  });
});
