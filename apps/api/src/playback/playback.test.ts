import { describe, expect, it, vi } from "vitest";
import { PlaybackController } from "./playback.module.js";

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
    const controller = new PlaybackController(prisma as never, {} as never);

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
      circuitBreaker: { findFirst: vi.fn().mockResolvedValue(null) }
    };
    const controller = new PlaybackController(prisma as never, {} as never);

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
      }
    };
    const controller = new PlaybackController(prisma as never, {} as never);

    await expect(
      controller.create(
        { kind: "user", sub: "user" },
        { episodeId: "episode-3", deviceId: "device-1" }
      )
    ).rejects.toMatchObject({ code: "UNCONFIRMED_EXPOSURE_LIMIT" });
  });
});
