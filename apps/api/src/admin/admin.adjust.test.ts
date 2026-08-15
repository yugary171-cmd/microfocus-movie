import {
  ADMIN_REASON_MAX_LENGTH,
  EntitlementAdjustmentType,
  EntitlementFactType,
  ERROR_CODES,
  PLAYBACK_WINDOW_SECONDS
} from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  adjustmentMatches,
  createIdempotentAdjustment
} from "./admin.adjust.js";

const grant = {
  id: "grant-1",
  userId: "user-1",
  dramaId: "drama-1",
  remainingSeconds: 100
};

const freezeRow = {
  id: "adj-freeze",
  type: EntitlementAdjustmentType.FREEZE_REMAINDER,
  grantId: grant.id,
  sourceFactType: EntitlementFactType.GRANT,
  sourceFactId: grant.id,
  freezeAdjustmentId: null,
  seconds: 40,
  reason: "错误发放冻结",
  createdAt: new Date("2026-08-14T00:00:00.000Z")
};

describe("entitlement adjustments", () => {
  it("treats remaining-seconds-independent fields as the idempotent payload", () => {
    expect(
      adjustmentMatches(freezeRow, {
        type: EntitlementAdjustmentType.FREEZE_REMAINDER,
        grantId: grant.id,
        seconds: 40,
        reason: "错误发放冻结",
        idempotencyKey: "a:1",
        operatorAdminId: "admin-1"
      })
    ).toBe(true);
    expect(
      adjustmentMatches(freezeRow, {
        type: EntitlementAdjustmentType.FREEZE_REMAINDER,
        grantId: grant.id,
        seconds: 41,
        reason: "错误发放冻结",
        idempotencyKey: "a:1",
        operatorAdminId: "admin-1"
      })
    ).toBe(false);
  });

  it("returns the original adjustment on replay", async () => {
    const prisma = {
      entitlementAdjustment: {
        findUnique: vi.fn().mockResolvedValue(freezeRow)
      },
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant)
      },
      $transaction: vi.fn()
    };
    const result = await createIdempotentAdjustment(prisma as unknown as PrismaService, {
      type: EntitlementAdjustmentType.FREEZE_REMAINDER,
      grantId: grant.id,
      seconds: 40,
      reason: "错误发放冻结",
      idempotencyKey: "a:1",
      operatorAdminId: "admin-1"
    });
    expect(result.replayed).toBe(true);
    expect(result.id).toBe(freezeRow.id);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("freezes only remaining seconds after active reservations", async () => {
    const prisma = transactionPrisma({
      playbackReservation: {
        findMany: vi.fn().mockResolvedValue([{ reservedSeconds: PLAYBACK_WINDOW_SECONDS }])
      }
    });
    await expect(
      createIdempotentAdjustment(prisma as unknown as PrismaService, {
        type: EntitlementAdjustmentType.FREEZE_REMAINDER,
        grantId: grant.id,
        seconds: grant.remainingSeconds - PLAYBACK_WINDOW_SECONDS + 1,
        reason: "错误发放冻结",
        idempotencyKey: "a:2",
        operatorAdminId: "admin-1"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.ADJUSTMENT_EXCEEDS_AVAILABLE });
  });

  it("decrements remaining seconds on freeze", async () => {
    const created = { ...freezeRow, seconds: 40 };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue(created);
    const prisma = transactionPrisma({
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        updateMany
      },
      entitlementAdjustment: { create },
      playbackReservation: { findMany: vi.fn().mockResolvedValue([]) }
    });
    const result = await createIdempotentAdjustment(prisma as unknown as PrismaService, {
      type: EntitlementAdjustmentType.FREEZE_REMAINDER,
      grantId: grant.id,
      seconds: 40,
      reason: "错误发放冻结",
      idempotencyKey: "a:3",
      operatorAdminId: "admin-1"
    });
    expect(result.replayed).toBe(false);
    expect(result.remainingSeconds).toBe(60);
    expect(updateMany).toHaveBeenCalled();
  });

  it("refuses a release larger than the unreleased freeze", async () => {
    const prisma = transactionPrisma({
      entitlementAdjustment: {
        findFirst: vi.fn().mockResolvedValue(freezeRow),
        aggregate: vi.fn().mockResolvedValue({ _sum: { seconds: 30 } })
      }
    });
    await expect(
      createIdempotentAdjustment(prisma as unknown as PrismaService, {
        type: EntitlementAdjustmentType.RELEASE_FREEZE,
        grantId: grant.id,
        freezeAdjustmentId: freezeRow.id,
        seconds: 20,
        reason: "确认可恢复冻结",
        idempotencyKey: "a:4",
        operatorAdminId: "admin-1"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.ADJUSTMENT_RELEASE_EXCEEDS_FREEZE });
  });

  it("does not change remaining seconds on write-off", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "adj-writeoff",
      type: EntitlementAdjustmentType.WRITE_OFF,
      grantId: grant.id,
      sourceFactType: EntitlementFactType.GRANT,
      sourceFactId: grant.id,
      freezeAdjustmentId: null,
      seconds: 40,
      reason: "已消费错误发放核销",
      createdAt: new Date()
    });
    const update = vi.fn();
    const prisma = transactionPrisma({
      entitlementAdjustment: { create },
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        update,
        updateMany: vi.fn()
      }
    });
    const result = await createIdempotentAdjustment(prisma as unknown as PrismaService, {
      type: EntitlementAdjustmentType.WRITE_OFF,
      grantId: grant.id,
      seconds: 40,
      reason: "已消费错误发放核销",
      idempotencyKey: "a:5",
      operatorAdminId: "admin-1"
    });
    expect(result.remainingSeconds).toBe(100);
    expect(update).not.toHaveBeenCalled();
  });

  it("caps stored reason and approval note to the contract max", async () => {
    const create = vi.fn().mockResolvedValue({ ...freezeRow, seconds: 40 });
    const prisma = transactionPrisma({
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      entitlementAdjustment: { create },
      playbackReservation: { findMany: vi.fn().mockResolvedValue([]) }
    });
    await createIdempotentAdjustment(prisma as unknown as PrismaService, {
      type: EntitlementAdjustmentType.FREEZE_REMAINDER,
      grantId: grant.id,
      seconds: 40,
      reason: "错".repeat(ADMIN_REASON_MAX_LENGTH + 5),
      approvalNote: "批".repeat(ADMIN_REASON_MAX_LENGTH + 5),
      idempotencyKey: "a:cap",
      operatorAdminId: "admin-1"
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: "错".repeat(ADMIN_REASON_MAX_LENGTH),
        approvalNote: "批".repeat(ADMIN_REASON_MAX_LENGTH)
      })
    });
  });

  it("rejects a reused key with a different payload", async () => {
    const prisma = {
      entitlementAdjustment: { findUnique: vi.fn().mockResolvedValue(freezeRow) },
      entitlementGrant: { findUnique: vi.fn() },
      $transaction: vi.fn()
    };
    await expect(
      createIdempotentAdjustment(prisma as unknown as PrismaService, {
        type: EntitlementAdjustmentType.WRITE_OFF,
        grantId: grant.id,
        seconds: 40,
        reason: "已消费错误发放核销",
        idempotencyKey: "a:1",
        operatorAdminId: "admin-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});

function transactionPrisma(tx: Record<string, unknown>) {
  const grantClient = {
    findUnique: vi.fn().mockResolvedValue(grant),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn()
  };
  const adjustmentClient = {
    create: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn().mockResolvedValue({ _sum: { seconds: 0 } })
  };
  const baseTx = {
    $queryRaw: vi.fn(),
    entitlementGrant: grantClient,
    entitlementAdjustment: adjustmentClient,
    entitlementDebit: { findFirst: vi.fn() },
    playbackReservation: { findMany: vi.fn().mockResolvedValue([]) }
  };
  const merged = {
    ...baseTx,
    ...tx,
    entitlementGrant: { ...grantClient, ...(tx.entitlementGrant as object) },
    entitlementAdjustment: { ...adjustmentClient, ...(tx.entitlementAdjustment as object) }
  };
  return {
    entitlementAdjustment: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    entitlementGrant: { findUnique: vi.fn().mockResolvedValue(grant) },
    $transaction: async (fn: (client: typeof merged) => Promise<unknown>) => fn(merged)
  };
}
