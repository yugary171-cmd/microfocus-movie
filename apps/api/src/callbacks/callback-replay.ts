import {
  ADMIN_REASON_MAX_LENGTH,
  CallbackEventStatus,
  ERROR_CODES,
  type CallbackReplayView,
  type ReplayCallbackEventRequest
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import { normalizeIdempotencyKey } from "../admin/admin.compensate.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { applyRewardCallback } from "../rewards/late-completion.js";
import { applyVodCallback, applyVodUploadCallback } from "./callback-apply-vod.js";
import {
  CALLBACK_PAYLOAD_REWARD_V1,
  CALLBACK_PAYLOAD_VOD_V1,
  readStoredPayload,
  type RewardCallbackBody,
  type VodCallbackBody
} from "./callback-payload.js";
import { finishCallbackEvent, releaseCallbackEvent } from "./callbacks.module.js";

const REPLAYABLE = new Set<string>([
  CallbackEventStatus.RETRYABLE_FAILURE,
  CallbackEventStatus.DEAD_LETTER
]);

const CALLBACK_LEASE_MS = 30_000;

export type ReplayCallbackPayload = ReplayCallbackEventRequest & {
  eventId: string;
  idempotencyKey: string;
  operatorAdminId: string;
};

export type ReplayExecutionDeps = {
  encryptionKey?: string;
  verifyReward(input: { challengeId: string; eventId: string }): Promise<boolean>;
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
  raw: Omit<ReplayCallbackPayload, "idempotencyKey"> & { idempotencyKey?: string },
  deps: ReplayExecutionDeps
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
    return toReplayView(existing.eventId, event?.status, event?.attempts ?? 0, true, false);
  }

  try {
    const unlocked = await applyReplay(prisma, payload);
    const executed = await executeStoredCallback(prisma, payload.eventId, deps);
    const event = await prisma.callbackEvent.findUnique({ where: { id: payload.eventId } });
    return toReplayView(
      unlocked.eventId,
      event?.status ?? unlocked.status,
      event?.attempts ?? unlocked.attempts,
      false,
      executed
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.callbackReplay.findUnique({
        where: { idempotencyKey: payload.idempotencyKey }
      });
      if (raced) {
        assertSameReplay(raced, payload);
        const event = await prisma.callbackEvent.findUnique({ where: { id: raced.eventId } });
        return toReplayView(raced.eventId, event?.status, event?.attempts ?? 0, true, false);
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
    const processingUntil = new Date(Date.now() + CALLBACK_LEASE_MS);
    const updated = await tx.callbackEvent.updateMany({
      where: {
        id: event.id,
        status: { in: ["RETRYABLE_FAILURE", "DEAD_LETTER"] },
        processedAt: null
      },
      data: {
        status: CallbackEventStatus.PROCESSING,
        processedAt: null,
        processingUntil,
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
        reason: payload.reason.slice(0, ADMIN_REASON_MAX_LENGTH),
        approvalNote: payload.approvalNote?.slice(0, ADMIN_REASON_MAX_LENGTH) ?? null,
        idempotencyKey: payload.idempotencyKey
      }
    });
    return toReplayView(event.id, CallbackEventStatus.PROCESSING, event.attempts, false, false);
  });
}

async function executeStoredCallback(
  prisma: PrismaService,
  eventId: string,
  deps: ReplayExecutionDeps
): Promise<boolean> {
  const event = await prisma.callbackEvent.findUnique({ where: { id: eventId } });
  if (!event) return false;
  const stored = readStoredPayload(event, deps.encryptionKey);
  if (!stored) return false;
  try {
    const outcome = await dispatchStoredCallback(prisma, eventId, stored, deps);
    await finishCallbackEvent(prisma, eventId, outcome);
    return true;
  } catch (error) {
    await releaseCallbackEvent(prisma, eventId, "RETRYABLE_FAILURE");
    throw error;
  }
}

async function dispatchStoredCallback(
  prisma: PrismaService,
  eventId: string,
  stored: { schema: string; body: VodCallbackBody | RewardCallbackBody },
  deps: ReplayExecutionDeps
): Promise<string> {
  if (stored.schema === CALLBACK_PAYLOAD_VOD_V1) {
    const body = stored.body as VodCallbackBody;
    if (!body.fileId || (body.kind !== "UPLOAD_COMPLETED" && !body.mediaStatus)) {
      throw Errors.conflict(ERROR_CODES.CALLBACK_PAYLOAD_UNAVAILABLE, "Stored VOD payload is incomplete");
    }
    return body.kind === "UPLOAD_COMPLETED"
      ? applyVodUploadCallback(prisma, body)
      : applyVodCallback(prisma, body);
  }
  if (stored.schema === CALLBACK_PAYLOAD_REWARD_V1) {
    const body = stored.body as RewardCallbackBody;
    if (!body.challengeId) {
      throw Errors.conflict(
        ERROR_CODES.CALLBACK_PAYLOAD_UNAVAILABLE,
        "Stored reward payload is incomplete"
      );
    }
    const verified = await deps.verifyReward({ challengeId: body.challengeId, eventId });
    if (!verified) return "REJECTED";
    return applyRewardCallback(prisma, {
      challengeId: body.challengeId,
      ...(body.completedAt ? { completedAt: body.completedAt } : {})
    });
  }
  throw Errors.conflict(
    ERROR_CODES.CALLBACK_PAYLOAD_UNAVAILABLE,
    "Stored callback payload schema is not supported"
  );
}

function toReplayView(
  eventId: string,
  status: string | undefined,
  attempts: number,
  replayed: boolean,
  executed: boolean
): CallbackReplayView {
  return {
    eventId,
    status: (status ?? CallbackEventStatus.PROCESSING) as CallbackReplayView["status"],
    attempts,
    replayed,
    executed
  };
}
