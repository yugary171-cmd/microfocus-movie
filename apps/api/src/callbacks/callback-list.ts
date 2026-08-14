import {
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  CallbackEventStatus,
  type AdminCallbackEventList,
  type AdminCallbackEventView
} from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { optionalEntityId } from "../common/entity-id.js";
import { maxListSkip } from "../common/list-pagination.js";

export const CALLBACK_BACKLOG_STATUSES: CallbackEventStatus[] = [
  CallbackEventStatus.RECEIVED,
  CallbackEventStatus.PROCESSING,
  CallbackEventStatus.RETRYABLE_FAILURE,
  CallbackEventStatus.DEAD_LETTER
];

const REPLAYABLE_STATUSES = new Set<string>([
  CallbackEventStatus.RETRYABLE_FAILURE,
  CallbackEventStatus.DEAD_LETTER
]);

export type CallbackEventListRow = {
  id: string;
  provider: string;
  eventType: string;
  status: string;
  attempts: number;
  receivedAt: Date;
  processedAt: Date | null;
  processingUntil: Date | null;
  outcome: string | null;
  payloadSchema: string | null;
  payloadRetainUntil: Date | null;
  payloadCiphertext?: string | null;
};

type CallbackEventReader = {
  callbackEvent: {
    count(args: unknown): Promise<number>;
    findMany(args: unknown): Promise<CallbackEventListRow[]>;
  };
};

export function resolveCallbackListStatuses(status?: string): CallbackEventStatus[] {
  const normalized = status?.trim();
  if (!normalized || normalized === "BACKLOG") return CALLBACK_BACKLOG_STATUSES;
  if (Object.values(CallbackEventStatus).includes(normalized as CallbackEventStatus)) {
    return [normalized as CallbackEventStatus];
  }
  throw Errors.badRequest("INVALID_CALLBACK_STATUS", "status must be BACKLOG or a CallbackEventStatus");
}

export function toAdminCallbackEventView(
  row: CallbackEventListRow,
  now = new Date()
): AdminCallbackEventView {
  const retainUntil = row.payloadRetainUntil;
  return {
    eventId: row.id,
    provider: row.provider,
    eventType: row.eventType,
    status: Object.values(CallbackEventStatus).includes(row.status as CallbackEventStatus)
      ? (row.status as CallbackEventStatus)
      : CallbackEventStatus.RECEIVED,
    attempts: row.attempts,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    processingUntil: row.processingUntil?.toISOString() ?? null,
    outcome: row.outcome,
    payloadAvailable: Boolean(row.payloadSchema) && retainUntil != null && retainUntil.getTime() > now.getTime(),
    replayable: REPLAYABLE_STATUSES.has(row.status)
  };
}

export async function listAdminCallbackEvents(
  prisma: CallbackEventReader,
  input: { status?: string; provider?: string; take?: number; skip?: number; now?: Date } = {}
): Promise<AdminCallbackEventList> {
  const statuses = resolveCallbackListStatuses(input.status);
  const provider = optionalEntityId(input.provider, "provider")?.toUpperCase();
  const take = Math.min(
    ADMIN_LIST_PAGE_SIZE * 2,
    Math.max(1, Number.isFinite(input.take) ? Number(input.take) : ADMIN_LIST_PAGE_SIZE)
  );
  const skip = Math.max(0, Number.isFinite(input.skip) ? Number(input.skip) : 0);
  if (skip > maxListSkip(take, ADMIN_LIST_MAX_PAGE)) {
    return { total: 0, items: [] };
  }
  const where = {
    status: { in: statuses },
    ...(provider ? { provider } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.callbackEvent.count({ where }),
    prisma.callbackEvent.findMany({
      where,
      orderBy: [{ status: "asc" }, { receivedAt: "asc" }],
      take,
      skip,
      select: {
        id: true,
        provider: true,
        eventType: true,
        status: true,
        attempts: true,
        receivedAt: true,
        processedAt: true,
        processingUntil: true,
        outcome: true,
        payloadSchema: true,
        payloadRetainUntil: true
      }
    })
  ]);
  return {
    total,
    items: rows.map((row) => toAdminCallbackEventView(row, input.now))
  };
}
