import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export type CompensationPayload = {
  compensationKey: string;
  userId: string;
  dramaId: string;
  seconds: number;
  expiresAt: Date;
  reason: string;
};

export function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key || key.length > 128) {
    throw Errors.badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required"
    );
  }
  return key;
}

export function compensationMatches(
  grant: {
    source: string;
    userId: string;
    dramaId: string;
    grantedSeconds: number;
    note: string | null;
  },
  payload: Pick<CompensationPayload, "userId" | "dramaId" | "seconds" | "reason">
): boolean {
  return (
    grant.source === "COMPENSATION" &&
    grant.userId === payload.userId &&
    grant.dramaId === payload.dramaId &&
    grant.grantedSeconds === payload.seconds &&
    (grant.note ?? "") === payload.reason
  );
}

function assertSameCompensation(
  grant: {
    source: string;
    userId: string;
    dramaId: string;
    grantedSeconds: number;
    note: string | null;
  },
  payload: Pick<CompensationPayload, "userId" | "dramaId" | "seconds" | "reason">
): void {
  if (!compensationMatches(grant, payload)) {
    throw Errors.conflict(
      "IDEMPOTENCY_KEY_REUSE",
      "Idempotency-Key was reused with a different payload"
    );
  }
}

export async function createIdempotentCompensation(
  prisma: PrismaService,
  payload: CompensationPayload
) {
  const existing = await prisma.entitlementGrant.findUnique({
    where: { compensationKey: payload.compensationKey }
  });
  if (existing) {
    assertSameCompensation(existing, payload);
    return { grant: existing, replayed: true };
  }
  try {
    const grant = await prisma.entitlementGrant.create({
      data: {
        userId: payload.userId,
        dramaId: payload.dramaId,
        source: "COMPENSATION",
        grantedSeconds: payload.seconds,
        remainingSeconds: payload.seconds,
        expiresAt: payload.expiresAt,
        note: payload.reason,
        compensationKey: payload.compensationKey
      }
    });
    return { grant, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.entitlementGrant.findUnique({
        where: { compensationKey: payload.compensationKey }
      });
      if (raced) {
        assertSameCompensation(raced, payload);
        return { grant: raced, replayed: true };
      }
    }
    throw error;
  }
}
