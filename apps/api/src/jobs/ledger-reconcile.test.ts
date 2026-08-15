import { describe, expect, it, vi } from "vitest";
import { REWARD_SECONDS } from "@microfocus/contracts";
import {
  LEDGER_RECONCILE_JOB,
  mismatchesForGrant,
  reconstructedRemaining,
  runLedgerReconcileJob,
  type LedgerGrantRow
} from "./ledger-reconcile.js";

function grant(input: Partial<LedgerGrantRow> = {}): LedgerGrantRow {
  return {
    id: "grant-1",
    grantedSeconds: REWARD_SECONDS,
    remainingSeconds: REWARD_SECONDS,
    challengeId: "challenge-1",
    challenge: { status: "COMPLETED" },
    debits: [],
    adjustments: [],
    ...input
  };
}

describe("entitlement ledger reconstruction", () => {
  it("rebuilds remaining seconds from grants, debits, freezes and releases", () => {
    expect(
      reconstructedRemaining({
        grantedSeconds: REWARD_SECONDS,
        debitSeconds: 200,
        freezeSeconds: 100,
        releaseSeconds: 50
      })
    ).toBe(REWARD_SECONDS - 200 - 100 + 50);
  });

  it("ignores write-off facts when reconstructing the user balance", () => {
    const found = mismatchesForGrant(
      grant({
        remainingSeconds: 400,
        debits: [{ seconds: 200 }],
        adjustments: [
          { type: "WRITE_OFF", seconds: 400 },
          { type: "FREEZE_REMAINDER", seconds: 0 }
        ]
      })
    );
    expect(found).toEqual([]);
  });

  it("flags a materialized remaining that does not match immutable facts", () => {
    expect(
      mismatchesForGrant(
        grant({
          remainingSeconds: 500,
          debits: [{ seconds: 200 }]
        })
      )
    ).toEqual([{ kind: "remaining", id: "grant-1", deltaSeconds: 100 }]);
  });

  it("flags a grant whose challenge is not in a completed state", () => {
    expect(
      mismatchesForGrant(
        grant({
          challenge: { status: "EXPIRED" }
        })
      )
    ).toEqual([{ kind: "challenge_status", id: "challenge-1", deltaSeconds: 0 }]);
  });
});

describe("ledger reconcile job", () => {
  it("does not scan when another instance holds the job lease", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      entitlementGrant: { findMany: vi.fn() },
      rewardChallenge: { findMany: vi.fn() },
      operationalEvent: { create: vi.fn() },
      circuitBreaker: { findUnique: vi.fn(), upsert: vi.fn() }
    };
    await expect(
      runLedgerReconcileJob(prisma, { ownerId: "b" })
    ).resolves.toMatchObject({ acquired: false, mismatchCount: 0 });
    expect(prisma.entitlementGrant.findMany).not.toHaveBeenCalled();
  });

  it("opens the LEDGER circuit on mismatch and does not rewrite remainingSeconds", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      entitlementGrant: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            grant({
              id: "grant-1",
              remainingSeconds: 599,
              debits: [{ seconds: 0 }]
            })
          ])
      },
      rewardChallenge: { findMany: vi.fn().mockResolvedValue([]) },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) },
      circuitBreaker: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert
      }
    };
    await expect(runLedgerReconcileJob(prisma, { ownerId: "a" })).resolves.toMatchObject({
      acquired: true,
      mismatchCount: 1,
      mismatchedSeconds: 1,
      circuitOpened: true
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: "PROVIDER:LEDGER" },
        create: expect.objectContaining({
          provider: "PROVIDER:LEDGER",
          state: "OPEN",
          updatedBy: "system:ledger-reconcile"
        })
      })
    );
    expect(prisma.backgroundJobLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobName: LEDGER_RECONCILE_JOB, ownerId: "a" }
      })
    );
  });

  it("does not open a circuit when reconstructed remaining matches", async () => {
    const upsert = vi.fn();
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      entitlementGrant: {
        findMany: vi.fn().mockResolvedValue([
          grant({
            remainingSeconds: 400,
            debits: [{ seconds: 200 }]
          })
        ])
      },
      rewardChallenge: { findMany: vi.fn().mockResolvedValue([]) },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) },
      circuitBreaker: { findUnique: vi.fn(), upsert }
    };
    await expect(runLedgerReconcileJob(prisma, { ownerId: "a" })).resolves.toMatchObject({
      mismatchCount: 0,
      circuitOpened: false
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("counts completed challenges that never received a grant", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      entitlementGrant: { findMany: vi.fn().mockResolvedValue([]) },
      rewardChallenge: { findMany: vi.fn().mockResolvedValue([{ id: "challenge-orphan" }]) },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) },
      circuitBreaker: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({})
      }
    };
    await expect(runLedgerReconcileJob(prisma, { ownerId: "a" })).resolves.toMatchObject({
      missingGrants: 1,
      mismatchCount: 1,
      circuitOpened: true
    });
  });
});
