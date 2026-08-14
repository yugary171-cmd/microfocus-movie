import { RIGHTS_EXPIRY_JOB, acquireJobLease, releaseJobLease } from "./job-lease.js";
import { tryOfflinePublishedDrama, type OfflineStore } from "../catalog/offline-drama.js";
import type { JobLeaseStore } from "./job-lease.js";

export type RightsExpiryStore = JobLeaseStore &
  OfflineStore & {
    rightsRecord: {
      updateMany(args: unknown): Promise<{ count: number }>;
    };
    drama: OfflineStore["drama"] & {
      findMany(args: unknown): Promise<Array<{ id: string }>>;
    };
    operationalEvent: {
      create(args: unknown): Promise<unknown>;
    };
    $transaction<T>(fn: (tx: RightsExpiryStore) => Promise<T>): Promise<T>;
  };

export async function expireLapsedRights(
  prisma: Pick<RightsExpiryStore, "rightsRecord">,
  now = new Date()
): Promise<number> {
  const expired = await prisma.rightsRecord.updateMany({
    where: { status: "ACTIVE", validUntil: { lte: now } },
    data: { status: "EXPIRED" }
  });
  return expired.count;
}

export async function findPublishedDramasWithoutCoveringRights(
  prisma: Pick<RightsExpiryStore, "drama">,
  now = new Date()
): Promise<string[]> {
  const rows = await prisma.drama.findMany({
    where: {
      status: "PUBLISHED",
      NOT: {
        rightsRecords: {
          some: {
            status: "ACTIVE",
            validFrom: { lte: now },
            validUntil: { gt: now }
          }
        }
      }
    },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

export async function runRightsExpiryJob(
  prisma: RightsExpiryStore,
  input: { ownerId: string; now?: Date } = { ownerId: "system" }
): Promise<{ acquired: boolean; expiredRights: number; offlined: number }> {
  const now = input.now ?? new Date();
  const acquired = await acquireJobLease(prisma, {
    jobName: RIGHTS_EXPIRY_JOB,
    ownerId: input.ownerId,
    now
  });
  if (!acquired) return { acquired: false, expiredRights: 0, offlined: 0 };
  try {
    const expiredRights = await expireLapsedRights(prisma, now);
    const dramaIds = await findPublishedDramasWithoutCoveringRights(prisma, now);
    let offlined = 0;
    for (const dramaId of dramaIds) {
      const didOffline = await prisma.$transaction(async (tx) => {
        const changed = await tryOfflinePublishedDrama(tx, dramaId, now);
        if (!changed) return false;
        await tx.operationalEvent.create({
          data: {
            eventType: "RIGHTS_EXPIRED_OFFLINE",
            actorType: "SYSTEM",
            entityType: "Drama",
            entityId: dramaId,
            metadataJson: { reason: "Active rights no longer cover now" }
          }
        });
        return true;
      });
      if (didOffline) offlined += 1;
    }
    return { acquired: true, expiredRights, offlined };
  } finally {
    await releaseJobLease(prisma, {
      jobName: RIGHTS_EXPIRY_JOB,
      ownerId: input.ownerId,
      now
    });
  }
}
