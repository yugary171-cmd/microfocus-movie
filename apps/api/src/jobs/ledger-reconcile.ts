import { openProviderCircuit } from "../domain/circuit.js";
import { acquireJobLease, releaseJobLease, type JobLeaseStore } from "./job-lease.js";

export const LEDGER_RECONCILE_JOB = "ledger-reconcile";
export const LEDGER_RECONCILE_BATCH = 200;
export const LEDGER_RECONCILE_MAX_BATCHES = 25;
export const LEDGER_SAMPLE_LIMIT = 5;
export const COMPLETED_CHALLENGE_STATUSES = ["COMPLETED", "COMPLETED_LATE"] as const;

export type LedgerGrantRow = {
  id: string;
  grantedSeconds: number;
  remainingSeconds: number;
  challengeId: string | null;
  challenge: { status: string } | null;
  debits: Array<{ seconds: number }>;
  adjustments: Array<{ type: string; seconds: number }>;
};

export type LedgerReconcileStore = JobLeaseStore & {
  entitlementGrant: {
    findMany(args: unknown): Promise<LedgerGrantRow[]>;
  };
  rewardChallenge: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
  };
  operationalEvent: {
    create(args: unknown): Promise<unknown>;
  };
  circuitBreaker: {
    findUnique(args: unknown): Promise<{ state: string } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
};

export type LedgerMismatch = {
  kind: "remaining" | "challenge_status" | "missing_grant";
  id: string;
  deltaSeconds: number;
};

export type LedgerReconcileResult = {
  scannedGrants: number;
  mismatchCount: number;
  mismatchedSeconds: number;
  missingGrants: number;
  sampleIds: string[];
  circuitOpened: boolean;
};

export function reconstructedRemaining(input: {
  grantedSeconds: number;
  debitSeconds: number;
  freezeSeconds: number;
  releaseSeconds: number;
}): number {
  return input.grantedSeconds - input.debitSeconds - input.freezeSeconds + input.releaseSeconds;
}

export function grantFactTotals(row: LedgerGrantRow): {
  debitSeconds: number;
  freezeSeconds: number;
  releaseSeconds: number;
} {
  return {
    debitSeconds: row.debits.reduce((sum, item) => sum + item.seconds, 0),
    freezeSeconds: row.adjustments
      .filter((item) => item.type === "FREEZE_REMAINDER")
      .reduce((sum, item) => sum + item.seconds, 0),
    releaseSeconds: row.adjustments
      .filter((item) => item.type === "RELEASE_FREEZE")
      .reduce((sum, item) => sum + item.seconds, 0)
  };
}

export function mismatchesForGrant(row: LedgerGrantRow): LedgerMismatch[] {
  const found: LedgerMismatch[] = [];
  const facts = grantFactTotals(row);
  const expected = reconstructedRemaining({
    grantedSeconds: row.grantedSeconds,
    ...facts
  });
  if (expected !== row.remainingSeconds) {
    found.push({
      kind: "remaining",
      id: row.id,
      deltaSeconds: row.remainingSeconds - expected
    });
  }
  if (
    row.challengeId &&
    (!row.challenge ||
      !COMPLETED_CHALLENGE_STATUSES.includes(
        row.challenge.status as (typeof COMPLETED_CHALLENGE_STATUSES)[number]
      ))
  ) {
    found.push({ kind: "challenge_status", id: row.challengeId, deltaSeconds: 0 });
  }
  return found;
}

export async function scanLedgerMismatches(
  prisma: Pick<LedgerReconcileStore, "entitlementGrant" | "rewardChallenge">
): Promise<Omit<LedgerReconcileResult, "circuitOpened">> {
  const mismatches: LedgerMismatch[] = [];
  let scannedGrants = 0;
  let cursor: string | undefined;

  for (let batch = 0; batch < LEDGER_RECONCILE_MAX_BATCHES; batch += 1) {
    const rows = await prisma.entitlementGrant.findMany({
      take: LEDGER_RECONCILE_BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        grantedSeconds: true,
        remainingSeconds: true,
        challengeId: true,
        challenge: { select: { status: true } },
        debits: { select: { seconds: true } },
        adjustments: { select: { type: true, seconds: true } }
      }
    });
    if (!rows.length) break;
    scannedGrants += rows.length;
    for (const row of rows) mismatches.push(...mismatchesForGrant(row));
    cursor = rows[rows.length - 1]?.id;
    if (rows.length < LEDGER_RECONCILE_BATCH) break;
  }

  const missing = await prisma.rewardChallenge.findMany({
    where: {
      status: { in: [...COMPLETED_CHALLENGE_STATUSES] },
      grant: null
    },
    select: { id: true },
    take: LEDGER_RECONCILE_BATCH
  });
  for (const row of missing) {
    mismatches.push({ kind: "missing_grant", id: row.id, deltaSeconds: 0 });
  }

  const mismatchedSeconds = mismatches.reduce(
    (sum, item) => sum + Math.abs(item.deltaSeconds),
    0
  );
  return {
    scannedGrants,
    mismatchCount: mismatches.length,
    mismatchedSeconds,
    missingGrants: missing.length,
    sampleIds: mismatches.slice(0, LEDGER_SAMPLE_LIMIT).map((item) => item.id)
  };
}

export async function runLedgerReconcileJob(
  prisma: LedgerReconcileStore,
  input: { ownerId: string; now?: Date } = { ownerId: "system" }
): Promise<{ acquired: boolean } & LedgerReconcileResult> {
  const now = input.now ?? new Date();
  const acquired = await acquireJobLease(prisma, {
    jobName: LEDGER_RECONCILE_JOB,
    ownerId: input.ownerId,
    now
  });
  if (!acquired) {
    return {
      acquired: false,
      scannedGrants: 0,
      mismatchCount: 0,
      mismatchedSeconds: 0,
      missingGrants: 0,
      sampleIds: [],
      circuitOpened: false
    };
  }
  try {
    const scan = await scanLedgerMismatches(prisma);
    let circuitOpened = false;
    if (scan.mismatchCount > 0) {
      await openProviderCircuit(
        prisma as never,
        "LEDGER",
        "Entitlement remainingSeconds or completed challenges diverged from immutable facts"
      );
      circuitOpened = true;
    }
    await prisma.operationalEvent.create({
      data: {
        eventType: "LEDGER_RECONCILED",
        actorType: "SYSTEM",
        entityType: "EntitlementGrant",
        value: scan.mismatchCount,
        metadataJson: {
          scannedGrants: scan.scannedGrants,
          mismatchedSeconds: scan.mismatchedSeconds,
          missingGrants: scan.missingGrants,
          sampleIds: scan.sampleIds,
          circuitOpened
        }
      }
    });
    return { acquired: true, ...scan, circuitOpened };
  } finally {
    await releaseJobLease(prisma, {
      jobName: LEDGER_RECONCILE_JOB,
      ownerId: input.ownerId,
      now
    });
  }
}
