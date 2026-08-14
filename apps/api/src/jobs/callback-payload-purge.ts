import { acquireJobLease, releaseJobLease, type JobLeaseStore } from "./job-lease.js";

export const CALLBACK_PAYLOAD_PURGE_JOB = "callback-payload-purge";
export const CALLBACK_PAYLOAD_PURGE_BATCH = 200;
export const CALLBACK_PAYLOAD_PURGE_MAX_BATCHES = 25;

export type CallbackPayloadPurgeStore = JobLeaseStore & {
  callbackEvent: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  operationalEvent: {
    create(args: unknown): Promise<unknown>;
  };
};

const expiredCiphertextWhere = (now: Date) => ({
  payloadCiphertext: { not: null },
  payloadRetainUntil: { lte: now }
});

export async function purgeExpiredCallbackPayloads(
  prisma: Pick<CallbackPayloadPurgeStore, "callbackEvent">,
  now = new Date()
): Promise<number> {
  let purged = 0;
  for (let batch = 0; batch < CALLBACK_PAYLOAD_PURGE_MAX_BATCHES; batch += 1) {
    const rows = await prisma.callbackEvent.findMany({
      where: expiredCiphertextWhere(now),
      select: { id: true },
      take: CALLBACK_PAYLOAD_PURGE_BATCH
    });
    if (!rows.length) break;
    const updated = await prisma.callbackEvent.updateMany({
      where: {
        id: { in: rows.map((row) => row.id) },
        ...expiredCiphertextWhere(now)
      },
      data: {
        payloadCiphertext: null,
        payloadSchema: null,
        payloadRetainUntil: null
      }
    });
    purged += updated.count;
    if (rows.length < CALLBACK_PAYLOAD_PURGE_BATCH) break;
  }
  return purged;
}

export async function runCallbackPayloadPurgeJob(
  prisma: CallbackPayloadPurgeStore,
  input: { ownerId: string; now?: Date } = { ownerId: "system" }
): Promise<{ acquired: boolean; purged: number }> {
  const now = input.now ?? new Date();
  const acquired = await acquireJobLease(prisma, {
    jobName: CALLBACK_PAYLOAD_PURGE_JOB,
    ownerId: input.ownerId,
    now
  });
  if (!acquired) return { acquired: false, purged: 0 };
  try {
    const purged = await purgeExpiredCallbackPayloads(prisma, now);
    if (purged > 0) {
      await prisma.operationalEvent.create({
        data: {
          eventType: "CALLBACK_PAYLOAD_PURGED",
          actorType: "SYSTEM",
          entityType: "CallbackEvent",
          value: purged,
          metadataJson: { retainedFields: ["id", "payloadHash", "status"] }
        }
      });
    }
    return { acquired: true, purged };
  } finally {
    await releaseJobLease(prisma, {
      jobName: CALLBACK_PAYLOAD_PURGE_JOB,
      ownerId: input.ownerId,
      now
    });
  }
}
