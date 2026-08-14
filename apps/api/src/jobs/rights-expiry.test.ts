import { describe, expect, it, vi } from "vitest";
import { tryOfflinePublishedDrama } from "../catalog/offline-drama.js";
import { acquireJobLease, releaseJobLease, RIGHTS_EXPIRY_JOB } from "./job-lease.js";
import { runRightsExpiryJob } from "./rights-expiry.js";

function leaseStore(input: { createRejects?: boolean; claimCount?: number; heldBy?: string }) {
  return {
    backgroundJobLease: {
      create: input.createRejects
        ? vi.fn().mockRejectedValue({ code: "P2002" })
        : vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: input.claimCount ?? 0 }),
      update: vi.fn().mockResolvedValue({})
    }
  };
}

describe("background job lease", () => {
  it("creates a lease on the first runner and steals only expired locks", async () => {
    const fresh = leaseStore({});
    await expect(
      acquireJobLease(fresh, { jobName: RIGHTS_EXPIRY_JOB, ownerId: "a" })
    ).resolves.toBe(true);
    const busy = leaseStore({ createRejects: true, claimCount: 0 });
    await expect(
      acquireJobLease(busy, { jobName: RIGHTS_EXPIRY_JOB, ownerId: "b" })
    ).resolves.toBe(false);
    const stale = leaseStore({ createRejects: true, claimCount: 1 });
    await expect(
      acquireJobLease(stale, { jobName: RIGHTS_EXPIRY_JOB, ownerId: "c" })
    ).resolves.toBe(true);
  });

  it("releases only the owning runner", async () => {
    const store = leaseStore({});
    await releaseJobLease(store, { jobName: RIGHTS_EXPIRY_JOB, ownerId: "a" });
    expect(store.backgroundJobLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobName: RIGHTS_EXPIRY_JOB, ownerId: "a" }
      })
    );
  });
});

describe("rights expiry offline", () => {
  it("offlines a published drama and revokes active leases once", async () => {
    const prisma = {
      drama: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      episode: { findMany: vi.fn().mockResolvedValue([{ id: "ep-1" }]) },
      playbackLease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
    };
    await expect(tryOfflinePublishedDrama(prisma, "drama-1")).resolves.toBe(true);
    expect(prisma.playbackLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { episodeId: { in: ["ep-1"] }, status: "ACTIVE" },
        data: expect.objectContaining({ status: "REVOKED", activeKey: null })
      })
    );
    prisma.drama.updateMany.mockResolvedValue({ count: 0 });
    await expect(tryOfflinePublishedDrama(prisma, "drama-1")).resolves.toBe(false);
  });

  it("skips work when the job lease is held and offlines uncovered published dramas", async () => {
    const operationalEvent = { create: vi.fn().mockResolvedValue({}) };
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn()
      },
      rightsRecord: { updateMany: vi.fn() },
      drama: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      episode: { findMany: vi.fn() },
      playbackLease: { updateMany: vi.fn() },
      operationalEvent,
      $transaction: vi.fn()
    };
    await expect(runRightsExpiryJob(prisma, { ownerId: "b" })).resolves.toEqual({
      acquired: false,
      expiredRights: 0,
      offlined: 0
    });
    expect(prisma.rightsRecord.updateMany).not.toHaveBeenCalled();

    prisma.backgroundJobLease.create.mockResolvedValue({});
    prisma.rightsRecord.updateMany.mockResolvedValue({ count: 2 });
    prisma.drama.findMany.mockResolvedValue([{ id: "drama-1" }]);
    prisma.drama.updateMany.mockResolvedValue({ count: 1 });
    prisma.episode.findMany.mockResolvedValue([{ id: "ep-1" }]);
    prisma.playbackLease.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma)
    );

    await expect(runRightsExpiryJob(prisma, { ownerId: "a" })).resolves.toEqual({
      acquired: true,
      expiredRights: 2,
      offlined: 1
    });
    expect(operationalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "RIGHTS_EXPIRED_OFFLINE",
          entityId: "drama-1"
        })
      })
    );
    expect(prisma.backgroundJobLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobName: RIGHTS_EXPIRY_JOB, ownerId: "a" }
      })
    );
  });
});
