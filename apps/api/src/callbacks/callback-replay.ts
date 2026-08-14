import {
  CallbackEventStatus,
  ERROR_CODES,
  type CallbackReplayView,
  type ReplayCallbackEventRequest
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import { normalizeIdempotencyKey } from "../admin/admin.compensate.js";
import type { PrismaService } from "../prisma/prisma.service.js";

const REPLAYABLE = new Set<string>([
  CallbackEventStatus.RETRYABLE_FAILURE,
  CallbackEventStatus.DEAD_LETTER
]);

export type ReplayCallbackPayload = ReplayCallbackEventRequest & {
  eventId: string;
  idempotencyKey: string;
  operatorAdminId: string;
};

type ReplayRow = {
  id: string;
  eventId: string;
  reason: string;
  approvalNote: string | null;
  operatorAdminId: string;
};

export async function replayCallbackEvent(
  prisma: PrismaService,
  raw: Omit<ReplayCallbackPayload, "idempotencyKey"> & { idempotencyKey?: string }
): Promise<CallbackReplayView> {
  const payload: ReplayCallbackPayload = {
    eventId: raw.eventId.trim(),
    reason: raw.reason.trim(),
    idempotencyKey: normalizeIdempotencyKey(raw.idempotencyKey),
    operatorAdminId: raw.operatorAdminId,
    ...(raw.approvalNote?.trim() ? { approvalNote: raw.approvalNote.trim() } : {})
  };
  if (!payload.eventId) throw Errors.notFound("Callback event");
  if (payload.reason.length < 6) {
    throw Errors.badRequest("INVALID_REASON", "Replay reason must be at least 6 characters");
  }

  const existing = await prisma.callbackReplay.findUnique({
    where: { idempotencyKey: payload.idempotencyKey }
  });
  if (existing) {
    assertSameReplay(existing, payload);
    const event = await prisma.callbackEvent.findUnique({ where: { id: existing.eventId } });
    return toReplayView(existing.eventId, event?.status, event?.attempts ?? 0, true);
  }

  try {
    return await applyReplay(prisma, payload);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.callbackReplay.findUnique({
        where: { idempotencyKey: payload.idempotencyKey }
      });
      if (raced) {
        assertSameReplay(raced, payload);
        const event = await prisma.callbackEvent.findUnique({ where: { id: raced.eventId } });
        return toReplayView(raced.eventId, event?.status, event?.attempts ?? 0, true);
      }
    }
    throw error;
  }
}

function assertSameReplay(row: ReplayRow, payload: ReplayCallbackPayload): void {
  if (
    row.eventId !== payload.eventId ||
    row.reason !== payload.reason ||
    (row.approvalNote ?? "") !== (payload.approvalNote ?? "") ||
    row.operatorAdminId !== payload.operatorAdminId
  ) {
    throw Errors.conflict(
      "IDEMPOTENCY_KEY_REUSE",
      "Idempotency-Key was reused with a different payload"
    );
  }
}

async function applyReplay(
  prisma: PrismaService,
  payload: ReplayCallbackPayload
): Promise<CallbackReplayView> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM CallbackEvent WHERE id = ${payload.eventId} FOR UPDATE`;
    const event = await tx.callbackEvent.findUnique({ where: { id: payload.eventId } });
    if (!event) throw Errors.notFound("Callback event");
    if (!REPLAYABLE.has(event.status)) {
      throw Errors.conflict(
        ERROR_CODES.CALLBACK_NOT_REPLAYABLE,
        "Only retryable or dead-letter callbacks can be replayed"
      );
    }
    const updated = await tx.callbackEvent.updateMany({
      where: {
        id: event.id,
        status: { in: ["RETRYABLE_FAILURE", "DEAD_LETTER"] },
        processedAt: null
      },
      data: {
        status: CallbackEventStatus.PROCESSING,
        processedAt: null,
        processingUntil: null,
        outcome: "REPLAY_UNLOCKED"
      }
    });
    if (updated.count !== 1) {
      throw Errors.conflict(
        ERROR_CODES.CALLBACK_NOT_REPLAYABLE,
        "Callback changed concurrently and is no longer replayable"
      );
    }
    await tx.callbackReplay.create({
      data: {
        eventId: event.id,
        operatorAdminId: payload.operatorAdminId,
        reason: payload.reason.slice(0, 300),
        approvalNote: payload.approvalNote?.slice(0, 300) ?? null,
        idempotencyKey: payload.idempotencyKey
      }
    });
    return toReplayView(event.id, CallbackEventStatus.PROCESSING, event.attempts, false);
  });
}

function toReplayView(
  eventId: string,
  status: string | undefined,
  attempts: number,
  replayed: boolean
): CallbackReplayView {
  return {
    eventId,
    status: (status ?? CallbackEventStatus.PROCESSING) as CallbackReplayView["status"],
    attempts,
    replayed
  };
}
