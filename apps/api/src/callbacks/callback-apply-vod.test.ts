import { describe, expect, it, vi } from "vitest";
import { applyVodCallback } from "./callback-apply-vod.js";

const readyBody = {
  eventId: "event-1",
  fileId: "file-1",
  mediaStatus: "READY" as const,
  transcodeStatus: "READY" as const,
  machineReviewStatus: "APPROVED" as const
};

const failedBody = {
  ...readyBody,
  mediaStatus: "FAILED" as const,
  transcodeStatus: "FAILED" as const,
  machineReviewStatus: "REJECTED" as const
};

function vodStore(asset: Record<string, unknown> | null) {
  const tx = {
    uploadSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({})
    },
    mediaAsset: {
      findUnique: vi.fn().mockResolvedValue(asset),
      update: vi.fn().mockResolvedValue({})
    },
    drama: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    episode: { findMany: vi.fn().mockResolvedValue([{ id: "ep-1" }]) },
    playbackLease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  };
  return {
    $transaction: vi.fn(async (fn: (store: typeof tx) => Promise<string>) => fn(tx)),
    tx
  };
}

function processingAsset(status = "DRAFT") {
  return {
    id: "asset-1",
    mediaStatus: "PROCESSING",
    transcodeStatus: "PROCESSING",
    machineReviewStatus: "PENDING",
    manualReviewStatus: "PENDING",
    wechatReviewStatus: "PENDING",
    episode: { dramaId: "drama-1", drama: { status } }
  };
}

describe("applyVodCallback", () => {
  it("does not create or guess READY media for an unknown file", async () => {
    const prisma = vodStore(null);
    await expect(applyVodCallback(prisma as never, readyBody)).resolves.toBe("MEDIA_NOT_FOUND");
    expect(prisma.tx.mediaAsset.update).not.toHaveBeenCalled();
  });

  it("rejects reviving failed dimensions and leaves the asset unchanged", async () => {
    const prisma = vodStore({
      ...processingAsset(),
      mediaStatus: "FAILED",
      transcodeStatus: "FAILED",
      machineReviewStatus: "REJECTED"
    });
    await expect(applyVodCallback(prisma as never, readyBody)).resolves.toBe("REJECTED");
    expect(prisma.tx.mediaAsset.update).not.toHaveBeenCalled();
    expect(prisma.tx.drama.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent for a repeated READY callback", async () => {
    const prisma = vodStore({
      ...processingAsset(),
      mediaStatus: "READY",
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED"
    });
    await expect(applyVodCallback(prisma as never, readyBody)).resolves.toBe("PROCESSED");
    expect(prisma.tx.mediaAsset.update).not.toHaveBeenCalled();
  });

  it("applies the first READY callback onto processing media", async () => {
    const prisma = vodStore(processingAsset());
    await expect(applyVodCallback(prisma as never, readyBody)).resolves.toBe("PROCESSED");
    expect(prisma.tx.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "asset-1" },
        data: {
          mediaStatus: "READY",
          transcodeStatus: "READY",
          machineReviewStatus: "APPROVED"
        }
      })
    );
  });

  it("offlines published drama when a later callback fails media", async () => {
    const prisma = vodStore({
      ...processingAsset("PUBLISHED"),
      mediaStatus: "READY",
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED",
      manualReviewStatus: "APPROVED",
      wechatReviewStatus: "APPROVED"
    });
    await expect(applyVodCallback(prisma as never, failedBody)).resolves.toBe(
      "PROCESSED_EMERGENCY_OFFLINE"
    );
    expect(prisma.tx.drama.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "drama-1", status: "PUBLISHED" },
        data: { status: "OFFLINE" }
      })
    );
    expect(prisma.tx.playbackLease.updateMany).toHaveBeenCalled();
  });
});
