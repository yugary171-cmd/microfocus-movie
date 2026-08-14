export const RIGHTS_EXPIRY_JOB = "rights-expiry";
export const RIGHTS_EXPIRY_LOCK_MS = 5 * 60 * 1000;

export type JobLeaseStore = {
  backgroundJobLease: {
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
  };
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
  );
}

export async function acquireJobLease(
  prisma: JobLeaseStore,
  input: { jobName: string; ownerId: string; now?: Date; lockMs?: number }
): Promise<boolean> {
  const now = input.now ?? new Date();
  const lockedUntil = new Date(now.getTime() + (input.lockMs ?? RIGHTS_EXPIRY_LOCK_MS));
  try {
    await prisma.backgroundJobLease.create({
      data: {
        jobName: input.jobName,
        ownerId: input.ownerId,
        lockedUntil
      }
    });
    return true;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const claimed = await prisma.backgroundJobLease.updateMany({
    where: { jobName: input.jobName, lockedUntil: { lte: now } },
    data: { ownerId: input.ownerId, lockedUntil }
  });
  return claimed.count === 1;
}

export async function releaseJobLease(
  prisma: JobLeaseStore,
  input: { jobName: string; ownerId: string; now?: Date }
): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.backgroundJobLease.updateMany({
    where: { jobName: input.jobName, ownerId: input.ownerId },
    data: { lockedUntil: now, lastRunAt: now }
  });
}
