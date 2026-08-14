import {
  EntitlementAdjustmentType,
  EntitlementFactType,
  ERROR_CODES,
  type CreateEntitlementAdjustmentRequest,
  type EntitlementAdjustmentView
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import { reservedSecondsForUser } from "../playback/playback-reservations.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { normalizeIdempotencyKey } from "./admin.compensate.js";

export type AdjustmentPayload = CreateEntitlementAdjustmentRequest & {
  idempotencyKey: string;
  operatorAdminId: string;
};

type AdjustmentRow = {
  id: string;
  type: string;
  grantId: string;
  sourceFactType: string;
  sourceFactId: string;
  freezeAdjustmentId: string | null;
  seconds: number;
  reason: string;
  createdAt: Date;
};

export function toAdjustmentView(
  row: AdjustmentRow,
  remainingSeconds: number,
  replayed: boolean
): EntitlementAdjustmentView {
  return {
    id: row.id,
    type: row.type as EntitlementAdjustmentView["type"],
    grantId: row.grantId,
    sourceFactType: row.sourceFactType as EntitlementAdjustmentView["sourceFactType"],
    sourceFactId: row.sourceFactId,
    freezeAdjustmentId: row.freezeAdjustmentId,
    seconds: row.seconds,
    reason: row.reason,
    remainingSeconds,
    createdAt: row.createdAt.toISOString(),
    replayed
  };
}

export function adjustmentMatches(
  row: AdjustmentRow,
  payload: AdjustmentPayload
): boolean {
  return (
    row.type === payload.type &&
    row.grantId === payload.grantId &&
    row.seconds === payload.seconds &&
    row.reason === payload.reason &&
    row.sourceFactId === resolveSourceFactId(payload) &&
    row.sourceFactType === resolveSourceFactType(payload) &&
    (row.freezeAdjustmentId ?? null) === (payload.freezeAdjustmentId ?? null)
  );
}

export async function createIdempotentAdjustment(
  prisma: PrismaService,
  raw: Omit<AdjustmentPayload, "idempotencyKey"> & { idempotencyKey?: string }
): Promise<EntitlementAdjustmentView> {
  const payload: AdjustmentPayload = {
    type: raw.type,
    grantId: raw.grantId,
    seconds: raw.seconds,
    reason: raw.reason.trim(),
    idempotencyKey: normalizeIdempotencyKey(raw.idempotencyKey),
    operatorAdminId: raw.operatorAdminId,
    ...(raw.sourceFactType ? { sourceFactType: raw.sourceFactType } : {}),
    ...(raw.sourceFactId?.trim() ? { sourceFactId: raw.sourceFactId.trim() } : {}),
    ...(raw.freezeAdjustmentId?.trim() ? { freezeAdjustmentId: raw.freezeAdjustmentId.trim() } : {}),
    ...(raw.approvalNote?.trim() ? { approvalNote: raw.approvalNote.trim() } : {})
  };
  const existing = await prisma.entitlementAdjustment.findUnique({
    where: { idempotencyKey: payload.idempotencyKey }
  });
  if (existing) {
    assertSameAdjustment(existing, payload);
    const grant = await prisma.entitlementGrant.findUnique({ where: { id: existing.grantId } });
    return toAdjustmentView(existing, grant?.remainingSeconds ?? 0, true);
  }
  try {
    return await applyAdjustment(prisma, payload);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.entitlementAdjustment.findUnique({
        where: { idempotencyKey: payload.idempotencyKey }
      });
      if (raced) {
        assertSameAdjustment(raced, payload);
        const grant = await prisma.entitlementGrant.findUnique({ where: { id: raced.grantId } });
        return toAdjustmentView(raced, grant?.remainingSeconds ?? 0, true);
      }
    }
    throw error;
  }
}

function assertSameAdjustment(row: AdjustmentRow, payload: AdjustmentPayload): void {
  if (!adjustmentMatches(row, payload)) {
    throw Errors.conflict(
      "IDEMPOTENCY_KEY_REUSE",
      "Idempotency-Key was reused with a different payload"
    );
  }
}

function resolveSourceFactType(payload: AdjustmentPayload): EntitlementFactType {
  if (payload.sourceFactType) return payload.sourceFactType;
  if (payload.type === EntitlementAdjustmentType.RELEASE_FREEZE) return EntitlementFactType.ADJUSTMENT;
  return EntitlementFactType.GRANT;
}

function resolveSourceFactId(payload: AdjustmentPayload): string {
  if (payload.sourceFactId) return payload.sourceFactId;
  if (payload.type === EntitlementAdjustmentType.RELEASE_FREEZE) {
    return payload.freezeAdjustmentId ?? "";
  }
  return payload.grantId;
}

async function applyAdjustment(
  prisma: PrismaService,
  payload: AdjustmentPayload
): Promise<EntitlementAdjustmentView> {
  return prisma.$transaction(async (tx) => {
    const grant = await tx.entitlementGrant.findUnique({ where: { id: payload.grantId } });
    if (!grant) throw Errors.notFound("Entitlement grant");
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${grant.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM EntitlementGrant WHERE id = ${grant.id} FOR UPDATE`;
    const locked = await tx.entitlementGrant.findUnique({ where: { id: grant.id } });
    if (!locked) throw Errors.notFound("Entitlement grant");

    const sourceFactType = resolveSourceFactType(payload);
    const sourceFactId = resolveSourceFactId(payload);
    if (!sourceFactId) {
      throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Adjustment source fact is required");
    }
    await assertSourceFact(tx, payload.type, locked.id, sourceFactType, sourceFactId, payload.freezeAdjustmentId);

    let remainingSeconds = locked.remainingSeconds;
    if (payload.type === EntitlementAdjustmentType.FREEZE_REMAINDER) {
      const reserved = await reservedSecondsForUser(tx, locked.userId, locked.dramaId);
      const available = Math.max(0, locked.remainingSeconds - reserved);
      if (payload.seconds > available) {
        throw Errors.conflict(
          ERROR_CODES.ADJUSTMENT_EXCEEDS_AVAILABLE,
          "Freeze cannot exceed remaining seconds after active reservations"
        );
      }
      const updated = await tx.entitlementGrant.updateMany({
        where: { id: locked.id, remainingSeconds: { gte: payload.seconds } },
        data: { remainingSeconds: { decrement: payload.seconds } }
      });
      if (updated.count !== 1) {
        throw Errors.conflict("ENTITLEMENT_CONFLICT", "Entitlement changed concurrently");
      }
      remainingSeconds = locked.remainingSeconds - payload.seconds;
    } else if (payload.type === EntitlementAdjustmentType.RELEASE_FREEZE) {
      const freezeId = payload.freezeAdjustmentId;
      if (!freezeId) {
        throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Release must reference a freeze adjustment");
      }
      const freeze = await tx.entitlementAdjustment.findFirst({
        where: { id: freezeId, grantId: locked.id, type: "FREEZE_REMAINDER" }
      });
      if (!freeze) throw Errors.notFound("Freeze adjustment");
      const released = await tx.entitlementAdjustment.aggregate({
        where: { freezeAdjustmentId: freeze.id, type: "RELEASE_FREEZE" },
        _sum: { seconds: true }
      });
      const remainingFreeze = freeze.seconds - (released._sum.seconds ?? 0);
      if (payload.seconds > remainingFreeze) {
        throw Errors.conflict(
          ERROR_CODES.ADJUSTMENT_RELEASE_EXCEEDS_FREEZE,
          "Release cannot exceed the unreleased freeze remainder"
        );
      }
      await tx.entitlementGrant.update({
        where: { id: locked.id },
        data: { remainingSeconds: { increment: payload.seconds } }
      });
      remainingSeconds = locked.remainingSeconds + payload.seconds;
    } else if (payload.type !== EntitlementAdjustmentType.WRITE_OFF) {
      throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Unsupported adjustment type");
    }

    const created = await tx.entitlementAdjustment.create({
      data: {
        type: payload.type,
        grantId: locked.id,
        sourceFactType,
        sourceFactId,
        freezeAdjustmentId: payload.freezeAdjustmentId ?? null,
        seconds: payload.seconds,
        reason: payload.reason.slice(0, 300),
        approvalNote: payload.approvalNote?.slice(0, 300) ?? null,
        operatorAdminId: payload.operatorAdminId,
        idempotencyKey: payload.idempotencyKey
      }
    });
    return toAdjustmentView(created, remainingSeconds, false);
  });
}

async function assertSourceFact(
  tx: Prisma.TransactionClient,
  type: EntitlementAdjustmentType,
  grantId: string,
  sourceFactType: EntitlementFactType,
  sourceFactId: string,
  freezeAdjustmentId: string | undefined
): Promise<void> {
  if (type === EntitlementAdjustmentType.FREEZE_REMAINDER) {
    if (sourceFactType !== EntitlementFactType.GRANT || sourceFactId !== grantId) {
      throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Freeze must reference the grant being frozen");
    }
    return;
  }
  if (type === EntitlementAdjustmentType.RELEASE_FREEZE) {
    if (
      sourceFactType !== EntitlementFactType.ADJUSTMENT ||
      !freezeAdjustmentId ||
      sourceFactId !== freezeAdjustmentId
    ) {
      throw Errors.badRequest(
        ERROR_CODES.ADJUSTMENT_INVALID_SOURCE,
        "Release must reference the freeze adjustment being released"
      );
    }
    return;
  }
  if (sourceFactType === EntitlementFactType.GRANT && sourceFactId === grantId) return;
  if (sourceFactType === EntitlementFactType.DEBIT) {
    const debit = await tx.entitlementDebit.findFirst({ where: { id: sourceFactId, grantId } });
    if (!debit) {
      throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Write-off debit does not belong to this grant");
    }
    return;
  }
  throw Errors.badRequest(ERROR_CODES.ADJUSTMENT_INVALID_SOURCE, "Write-off must reference the grant or a related debit");
}
