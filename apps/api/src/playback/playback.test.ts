import { describe, expect, it, vi } from "vitest";
import { PlaybackController } from "./playback.module.js";

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
        aggregate: vi.fn().mockResolvedValue({ _sum: { remainingSeconds: 600 } })
      },
      playbackReservation: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(3)
      },
      rateLimitBucket: allowRateLimit()
    };
    const controller = createController(prisma);

    await expect(
      controller.create(
        { kind: "user", sub: "user" },
        { episodeId: "episode-3", deviceId: "device-1" }
      )
    ).rejects.toMatchObject({ code: "UNCONFIRMED_EXPOSURE_LIMIT" });
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
          { id: "grant", remainingSeconds: 600, expiresAt: new Date(now + 60_000) }
        ]),
        updateMany: vi.fn()
      },
      entitlementDebit
    };
    const prisma = {
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
});
