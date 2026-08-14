import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DELETION_CONFIRMATION,
  DELETION_QUERY_TOKEN_TTL_SECONDS,
  DeletionRequestStatus,
  ERROR_CODES,
  type AdminDeletionRequestView,
  type CreateDeletionRequestResponse,
  type DeletionRequestView,
  type ReissueDeletionQueryTokenResponse
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { assertRecentWechatReauth } from "../auth/reauth.js";
import { Errors } from "../common/app-error.js";
import { releaseOpenReservations } from "../playback/playback-reservations.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { WechatProvider } from "../providers/providers.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";

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
  input: {
    userId: string;
    confirmation: string;
    wechatCode: string;
    wechatMode: "mock" | "live";
    wechat: WechatProvider;
    idempotencyKey?: string;
    now?: Date;
  }
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
  await assertNamedRateLimit(prisma, "deletionCreate", `user:${input.userId}`);
  await assertRecentWechatReauth({
    prisma,
    wechat: input.wechat,
    wechatMode: input.wechatMode,
    userId: input.userId,
    wechatCode: input.wechatCode
  });
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
  input: { deletionRequestId: string; queryToken: string; ipKey: string; now?: Date }
): Promise<DeletionRequestView> {
  await assertNamedRateLimit(prisma, "deletionLookup", input.ipKey);
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

const QUERY_TOKEN_REISSUE_COOLDOWN_MS = 60_000;

function toAdminDeletionView(row: {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  tokenExpiresAt: Date;
  statusReason: string | null;
}): AdminDeletionRequestView {
  return {
    deletionRequestId: row.id,
    userId: row.userId,
    status: row.status as DeletionRequestStatus,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    tokenExpiresAt: row.tokenExpiresAt.toISOString(),
    reason: row.statusReason
  };
}

export async function lookupAdminDeletionRequest(
  prisma: PrismaService,
  input: { deletionRequestId?: string; userId?: string }
): Promise<AdminDeletionRequestView> {
  const deletionRequestId = input.deletionRequestId?.trim() ?? "";
  const userId = input.userId?.trim() ?? "";
  const row = deletionRequestId
    ? await prisma.deletionRequest.findUnique({ where: { id: deletionRequestId } })
    : userId
      ? await prisma.deletionRequest.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" }
        })
      : null;
  if (!row) throw Errors.notFound("Deletion request");
  if (userId && row.userId !== userId) {
    throw Errors.forbidden(
      ERROR_CODES.DELETION_IDENTITY_MISMATCH,
      "Confirmed user does not match this deletion request"
    );
  }
  return toAdminDeletionView(row);
}

export async function reissueDeletionQueryToken(
  prisma: PrismaService,
  input: {
    deletionRequestId: string;
    userId: string;
    reason: string;
    approvalNote: string;
    operatorAdminId: string;
    idempotencyKey?: string;
    now?: Date;
  }
): Promise<ReissueDeletionQueryTokenResponse> {
  const deletionRequestId = input.deletionRequestId.trim();
  const userId = input.userId.trim();
  const reason = input.reason.trim();
  const approvalNote = input.approvalNote.trim();
  if (!deletionRequestId) throw Errors.notFound("Deletion request");
  if (!userId) {
    throw Errors.badRequest(ERROR_CODES.DELETION_IDENTITY_MISMATCH, "Confirmed user ID is required");
  }
  if (reason.length < 6 || approvalNote.length < 6) {
    throw Errors.badRequest("INVALID_REASON", "Reason and approval note must be at least 6 characters");
  }
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.deletionQueryTokenReissue.findUnique({
    where: { idempotencyKey }
  });
  if (existing) {
    if (
      existing.deletionRequestId !== deletionRequestId ||
      existing.confirmedUserId !== userId ||
      existing.reason !== reason ||
      existing.approvalNote !== approvalNote ||
      existing.operatorAdminId !== input.operatorAdminId
    ) {
      throw Errors.conflict("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key was reused with a different payload");
    }
    const row = await prisma.deletionRequest.findUnique({ where: { id: existing.deletionRequestId } });
    if (!row) throw Errors.notFound("Deletion request");
    return {
      deletionRequestId: row.id,
      status: row.status as DeletionRequestStatus,
      tokenExpiresAt: row.tokenExpiresAt.toISOString(),
      replayed: true
    };
  }
  const now = input.now ?? new Date();
  const queryToken = randomBytes(32).toString("base64url");
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM DeletionRequest WHERE id = ${deletionRequestId} FOR UPDATE`;
      const row = await tx.deletionRequest.findUnique({ where: { id: deletionRequestId } });
      if (!row) throw Errors.notFound("Deletion request");
      if (row.userId !== userId) {
        throw Errors.forbidden(
          ERROR_CODES.DELETION_IDENTITY_MISMATCH,
          "Confirmed user does not match this deletion request"
        );
      }
      const recent = await tx.deletionQueryTokenReissue.findFirst({
        where: { deletionRequestId },
        orderBy: { createdAt: "desc" }
      });
      if (recent && now.getTime() - recent.createdAt.getTime() < QUERY_TOKEN_REISSUE_COOLDOWN_MS) {
        throw Errors.rateLimited("Deletion query token reissue is rate limited");
      }
      const tokenExpiresAt = new Date(now.getTime() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000);
      await tx.deletionRequest.update({
        where: { id: row.id },
        data: {
          queryTokenHash: hashDeletionQueryToken(queryToken),
          tokenExpiresAt,
          lastQueriedAt: null
        }
      });
      await tx.deletionQueryTokenReissue.create({
        data: {
          deletionRequestId: row.id,
          operatorAdminId: input.operatorAdminId,
          reason,
          approvalNote,
          confirmedUserId: userId,
          idempotencyKey
        }
      });
      return { ...row, tokenExpiresAt };
    });
    return {
      deletionRequestId: updated.id,
      status: updated.status as DeletionRequestStatus,
      tokenExpiresAt: updated.tokenExpiresAt.toISOString(),
      deletionQueryToken: queryToken,
      replayed: false
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.deletionQueryTokenReissue.findUnique({ where: { idempotencyKey } });
      if (raced && raced.deletionRequestId === deletionRequestId) {
        const row = await prisma.deletionRequest.findUnique({ where: { id: raced.deletionRequestId } });
        if (row) {
          return {
            deletionRequestId: row.id,
            status: row.status as DeletionRequestStatus,
            tokenExpiresAt: row.tokenExpiresAt.toISOString(),
            replayed: true
          };
        }
      }
    }
    throw error;
  }
}
