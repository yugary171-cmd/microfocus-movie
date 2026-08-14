import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DELETION_CONFIRMATION,
  DELETION_QUERY_TOKEN_TTL_SECONDS,
  DeletionRequestStatus,
  ERROR_CODES,
  type CreateDeletionRequestResponse,
  type DeletionRequestView
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import { releaseOpenReservations } from "../playback/playback-reservations.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export function hashDeletionQueryToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(storedHash: string, presentedToken: string): boolean {
  const presented = Buffer.from(hashDeletionQueryToken(presentedToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key || key.length > 128) {
    throw Errors.badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required"
    );
  }
  return key;
}

export async function createDeletionRequest(
  prisma: PrismaService,
  input: { userId: string; confirmation: string; idempotencyKey?: string; now?: Date }
): Promise<CreateDeletionRequestResponse> {
  if (input.confirmation !== DELETION_CONFIRMATION) {
    throw Errors.badRequest("DELETION_CONFIRMATION_REQUIRED", "Account deletion must be explicitly confirmed");
  }
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.deletionRequest.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw Errors.conflict("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key was reused with a different payload");
    }
    return {
      deletionRequestId: existing.id,
      status: existing.status as DeletionRequestStatus,
      tokenExpiresAt: existing.tokenExpiresAt.toISOString(),
      replayed: true
    };
  }
  const now = input.now ?? new Date();
  const queryToken = randomBytes(32).toString("base64url");
  try {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user) throw Errors.notFound("User");
      if (user.status !== "ACTIVE") {
        const open = await tx.deletionRequest.findFirst({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" }
        });
        if (open) return { replayed: true as const, row: open, queryToken: undefined };
        throw Errors.unauthorized("This account is unavailable", ERROR_CODES.ACCOUNT_UNAVAILABLE);
      }
      await tx.user.update({
        where: { id: input.userId },
        data: { status: "DELETION_PENDING" }
      });
      const leases = await tx.playbackLease.findMany({
        where: { userId: input.userId, status: "ACTIVE" },
        select: { id: true }
      });
      await tx.playbackLease.updateMany({
        where: { userId: input.userId, status: "ACTIVE" },
        data: { status: "REVOKED", activeKey: null, revokedAt: now }
      });
      for (const lease of leases) {
        await releaseOpenReservations(tx, lease.id);
      }
      await tx.rewardChallenge.updateMany({
        where: { userId: input.userId, status: "PENDING" },
        data: { status: "EXPIRED" }
      });
      const row = await tx.deletionRequest.create({
        data: {
          userId: input.userId,
          idempotencyKey,
          queryTokenHash: hashDeletionQueryToken(queryToken),
          tokenExpiresAt: new Date(now.getTime() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000)
        }
      });
      return { replayed: false as const, row, queryToken };
    });
    return {
      deletionRequestId: created.row.id,
      status: created.row.status as DeletionRequestStatus,
      tokenExpiresAt: created.row.tokenExpiresAt.toISOString(),
      replayed: created.replayed,
      ...(created.queryToken ? { deletionQueryToken: created.queryToken } : {})
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.deletionRequest.findUnique({ where: { idempotencyKey } });
      if (raced && raced.userId === input.userId) {
        return {
          deletionRequestId: raced.id,
          status: raced.status as DeletionRequestStatus,
          tokenExpiresAt: raced.tokenExpiresAt.toISOString(),
          replayed: true
        };
      }
    }
    throw error;
  }
}

export async function lookupDeletionRequest(
  prisma: PrismaService,
  input: { deletionRequestId: string; queryToken: string; now?: Date }
): Promise<DeletionRequestView> {
  const token = input.queryToken.trim();
  if (!token) {
    throw Errors.unauthorized("Deletion query token is required", ERROR_CODES.DELETION_TOKEN_INVALID);
  }
  const row = await prisma.deletionRequest.findUnique({ where: { id: input.deletionRequestId } });
  if (!row || !tokensMatch(row.queryTokenHash, token)) {
    throw Errors.unauthorized("Deletion query token is invalid", ERROR_CODES.DELETION_TOKEN_INVALID);
  }
  const now = input.now ?? new Date();
  if (row.tokenExpiresAt <= now) {
    throw Errors.unauthorized("Deletion query token expired", ERROR_CODES.DELETION_TOKEN_INVALID);
  }
  if (row.lastQueriedAt && now.getTime() - row.lastQueriedAt.getTime() < 1000) {
    throw Errors.rateLimited("Deletion status queries are rate limited");
  }
  await prisma.deletionRequest.update({
    where: { id: row.id },
    data: { lastQueriedAt: now }
  });
  return {
    deletionRequestId: row.id,
    status: row.status as DeletionRequestStatus,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    tokenExpiresAt: row.tokenExpiresAt.toISOString(),
    reason: row.statusReason
  };
}
