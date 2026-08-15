import { describe, expect, it, vi } from "vitest";
import { ANONYMIZED_USER_DISPLAY_NAME, RETENTION_MATRIX_APPROVED } from "@microfocus/contracts";
import {
  cleanupPendingDeletions,
  DELETION_CLEANUP_JOB,
  runDeletionCleanupJob
} from "./deletion-cleanup.js";

describe("deletion cleanup retention gate", () => {
  it("keeps the retention matrix fail-closed", () => {
    expect(RETENTION_MATRIX_APPROVED).toBe(false);
  });

  it("does not anonymize or delete ledger rows while the matrix is unapproved", async () => {
    const prisma = {
      deletionRequest: {
        findMany: vi.fn().mockResolvedValue([{ id: "del-1", userId: "user-1" }]),
        updateMany: vi.fn()
      },
      user: { update: vi.fn() },
      watchProgress: { deleteMany: vi.fn() },
      operationalEvent: { create: vi.fn() }
    };
    await expect(cleanupPendingDeletions(prisma)).resolves.toEqual({
      cleaned: 0,
      skipped: 1,
      blocked: true
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.watchProgress.deleteMany).not.toHaveBeenCalled();
    expect(prisma.deletionRequest.updateMany).not.toHaveBeenCalled();
  });

  it("anonymizes profile and deletes progress only when explicitly approved", async () => {
    const prisma = {
      deletionRequest: {
        findMany: vi.fn().mockResolvedValue([{ id: "del-1", userId: "user-1" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      watchProgress: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      operationalEvent: { create: vi.fn() }
    };
    const now = new Date("2026-08-15T12:00:00.000Z");
    await expect(cleanupPendingDeletions(prisma, { approved: true, now })).resolves.toEqual({
      cleaned: 1,
      skipped: 0,
      blocked: false
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        displayName: ANONYMIZED_USER_DISPLAY_NAME,
        avatarUrl: null,
        openId: "deleted:user-1"
      }
    });
    expect(prisma.watchProgress.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("records a blocked operational event and does not log personal data", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      deletionRequest: {
        findMany: vi.fn().mockResolvedValue([{ id: "del-1", userId: "user-1" }]),
        updateMany: vi.fn()
      },
      user: { update: vi.fn() },
      watchProgress: { deleteMany: vi.fn() },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(runDeletionCleanupJob(prisma, { ownerId: "a" })).resolves.toEqual({
      acquired: true,
      cleaned: 0,
      skipped: 1,
      blocked: true
    });
    expect(prisma.operationalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "DELETION_CLEANUP_BLOCKED",
          value: 1,
          metadataJson: expect.objectContaining({ blocked: true })
        })
      })
    );
    const payload = JSON.stringify(prisma.operationalEvent.create.mock.calls[0]);
    expect(payload).not.toContain("openId");
    expect(payload).not.toContain("user-1");
  });

  it("does not scan deletion requests when the job lease is held", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      deletionRequest: { findMany: vi.fn(), updateMany: vi.fn() },
      user: { update: vi.fn() },
      watchProgress: { deleteMany: vi.fn() },
      operationalEvent: { create: vi.fn() }
    };
    await expect(runDeletionCleanupJob(prisma, { ownerId: "b" })).resolves.toEqual({
      acquired: false,
      cleaned: 0,
      skipped: 0,
      blocked: true
    });
    expect(prisma.deletionRequest.findMany).not.toHaveBeenCalled();
    expect(DELETION_CLEANUP_JOB).toBe("deletion-cleanup");
  });
});
