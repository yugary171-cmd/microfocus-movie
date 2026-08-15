import {
  ANONYMIZED_USER_DISPLAY_NAME,
  RETENTION_MATRIX_APPROVED
} from "@microfocus/contracts";
import { acquireJobLease, releaseJobLease, type JobLeaseStore } from "./job-lease.js";

export const DELETION_CLEANUP_JOB = "deletion-cleanup";

export type DeletionCleanupStore = JobLeaseStore & {
  deletionRequest: {
    findMany(args: unknown): Promise<Array<{ id: string; userId: string }>>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  user: {
    update(args: unknown): Promise<unknown>;
  };
  watchProgress: {
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  operationalEvent: {
    create(args: unknown): Promise<unknown>;
  };
};

export async function anonymizeDeletableUserData(
  prisma: Pick<DeletionCleanupStore, "user" | "watchProgress" | "deletionRequest">,
  userId: string,
  now = new Date()
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: ANONYMIZED_USER_DISPLAY_NAME,
      avatarUrl: null,
      signature: "",
      gender: "unset",
      openId: `deleted:${userId}`
    }
  });
  await prisma.watchProgress.deleteMany({ where: { userId } });
  await prisma.deletionRequest.updateMany({
    where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "COMPLETED", processedAt: now }
  });
}

export async function cleanupPendingDeletions(
  prisma: DeletionCleanupStore,
  input: { approved?: boolean; now?: Date } = {}
): Promise<{ cleaned: number; skipped: number; blocked: boolean }> {
  const approved = input.approved ?? RETENTION_MATRIX_APPROVED;
  const pending = await prisma.deletionRequest.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    select: { id: true, userId: true }
  });
  if (!approved) {
    return { cleaned: 0, skipped: pending.length, blocked: true };
  }
  let cleaned = 0;
  for (const row of pending) {
    await anonymizeDeletableUserData(prisma, row.userId, input.now);
    cleaned += 1;
  }
  return { cleaned, skipped: 0, blocked: false };
}

export async function runDeletionCleanupJob(
  prisma: DeletionCleanupStore,
  input: { ownerId: string; now?: Date; approved?: boolean } = { ownerId: "system" }
): Promise<{ acquired: boolean; cleaned: number; skipped: number; blocked: boolean }> {
  const now = input.now ?? new Date();
  const acquired = await acquireJobLease(prisma, {
    jobName: DELETION_CLEANUP_JOB,
    ownerId: input.ownerId,
    now
  });
  if (!acquired) {
    return { acquired: false, cleaned: 0, skipped: 0, blocked: RETENTION_MATRIX_APPROVED === false };
  }
  try {
    const result = await cleanupPendingDeletions(prisma, {
      ...(input.approved === undefined ? {} : { approved: input.approved }),
      now
    });
    await prisma.operationalEvent.create({
      data: {
        eventType: result.blocked ? "DELETION_CLEANUP_BLOCKED" : "DELETION_CLEANUP_APPLIED",
        actorType: "SYSTEM",
        entityType: "DeletionRequest",
        value: result.blocked ? result.skipped : result.cleaned,
        metadataJson: {
          blocked: result.blocked,
          retained: ["entitlement_ledger", "reward_challenges", "playback_leases", "admin_audit"]
        }
      }
    });
    return { acquired: true, ...result };
  } finally {
    await releaseJobLease(prisma, {
      jobName: DELETION_CLEANUP_JOB,
      ownerId: input.ownerId,
      now
    });
  }
}
