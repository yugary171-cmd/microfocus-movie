import {
  DELETION_CONFIRMATION,
  ERROR_CODES
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createDeletionRequest, hashDeletionQueryToken, lookupDeletionRequest, reissueDeletionQueryToken } from "./deletion.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

const user = { id: "user-1", status: "ACTIVE", openId: "wx-open-id" };

function allowRateLimit() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

function deletionInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: user.id,
    confirmation: DELETION_CONFIRMATION,
    wechatCode: "fresh-login-code",
    wechatMode: "live" as const,
    wechat: { exchangeCode: vi.fn().mockResolvedValue({ openId: user.openId }) },
    idempotencyKey: "del-key",
    ...overrides
  };
}

describe("account deletion", () => {
  it("marks the account pending, revokes leases, and expires pending challenges", async () => {
    const created = {
      id: "del-1",
      status: "PENDING",
      tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z"),
      userId: user.id
    };
    const tx = {
      $queryRaw: vi.fn(),
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        update: vi.fn()
      },
      playbackLease: {
        findMany: vi.fn().mockResolvedValue([{ id: "lease-1" }]),
        updateMany: vi.fn()
      },
      playbackReservation: { updateMany: vi.fn() },
      rewardChallenge: { updateMany: vi.fn() },
      deletionRequest: { create: vi.fn().mockResolvedValue(created) }
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      deletionRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      rateLimitBucket: allowRateLimit(),
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    };
    const result = await createDeletionRequest(prisma as never, deletionInput({
      now: new Date("2026-08-14T00:00:00.000Z")
    }));
    expect(result.replayed).toBe(false);
    expect(result.deletionQueryToken).toBeTruthy();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DELETION_PENDING" } })
    );
    expect(tx.playbackLease.updateMany).toHaveBeenCalled();
    expect(tx.rewardChallenge.updateMany).toHaveBeenCalled();
  });

  it("replays the same idempotency key without a new query token", async () => {
    const existing = {
      id: "del-1",
      userId: user.id,
      status: "PENDING",
      tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z")
    };
    const prisma = {
      deletionRequest: { findUnique: vi.fn().mockResolvedValue(existing) },
      rateLimitBucket: allowRateLimit(),
      $transaction: vi.fn()
    };
    const wechat = { exchangeCode: vi.fn() };
    const result = await createDeletionRequest(
      prisma as never,
      deletionInput({ wechat })
    );
    expect(result).toMatchObject({ deletionRequestId: "del-1", replayed: true });
    expect(result.deletionQueryToken).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(wechat.exchangeCode).not.toHaveBeenCalled();
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a reused key from another user", async () => {
    const prisma = {
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "del-1",
          userId: "other",
          status: "PENDING",
          tokenExpiresAt: new Date()
        })
      }
    };
    await expect(
      createDeletionRequest(prisma as never, deletionInput())
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE" });
  });

  it("looks up status with the query token and rate-limits repeats", async () => {
    const token = "query-token";
    const row = {
      id: "del-1",
      queryTokenHash: hashDeletionQueryToken(token),
      status: "PENDING",
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      processedAt: null,
      tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z"),
      lastQueriedAt: null,
      statusReason: null
    };
    const prisma = {
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn()
      }
    };
    const view = await lookupDeletionRequest(prisma as never, {
      deletionRequestId: "del-1",
      queryToken: token,
      now: new Date("2026-08-14T01:00:00.000Z")
    });
    expect(view.status).toBe("PENDING");
    await expect(
      lookupDeletionRequest(
        {
          deletionRequest: {
            findUnique: vi.fn().mockResolvedValue({
              ...row,
              lastQueriedAt: new Date("2026-08-14T01:00:00.000Z")
            }),
            update: vi.fn()
          }
        } as never,
        {
          deletionRequestId: "del-1",
          queryToken: token,
          now: new Date("2026-08-14T01:00:00.400Z")
        }
      )
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("rejects an invalid query token", async () => {
    await expect(
      lookupDeletionRequest(
        {
          deletionRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: "del-1",
              queryTokenHash: hashDeletionQueryToken("other"),
              tokenExpiresAt: new Date("2099-01-01"),
              lastQueriedAt: null
            })
          }
        } as never,
        { deletionRequestId: "del-1", queryToken: "nope" }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.DELETION_TOKEN_INVALID });
  });

  it("recovers a unique-key race as a replay", async () => {
    const raced = {
      id: "del-1",
      userId: user.id,
      status: "PENDING",
      tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z")
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(raced)
      },
      rateLimitBucket: allowRateLimit(),
      $transaction: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test"
        })
      )
    };
    const result = await createDeletionRequest(prisma as never, deletionInput());
    expect(result.replayed).toBe(true);
    expect(result.deletionQueryToken).toBeUndefined();
  });

  it("rate-limits new deletion requests by authenticated user before WeChat reauth", async () => {
    expect(RATE_LIMITS.deletionCreate).toEqual({ limit: 5, windowMs: 10 * 60_000 });
    const wechat = { exchangeCode: vi.fn() };
    const prisma = {
      deletionRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      $transaction: vi.fn()
    };
    await expect(
      createDeletionRequest(prisma as never, deletionInput({ wechat }))
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(wechat.exchangeCode).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("deletionCreate", "user:user-1")
        })
      })
    );
  });

  it("reissues a query token only when the confirmed user matches", async () => {
    const row = {
      id: "del-1",
      userId: user.id,
      status: "PENDING",
      tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z"),
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      processedAt: null,
      statusReason: null
    };
    const tx = {
      $queryRaw: vi.fn(),
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn()
      },
      deletionQueryTokenReissue: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn()
      }
    };
    const prisma = {
      deletionQueryTokenReissue: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    };
    const result = await reissueDeletionQueryToken(prisma as never, {
      deletionRequestId: "del-1",
      userId: user.id,
      reason: "用户遗失查询令牌",
      approvalNote: "工单 CS-1 已核验微焦号",
      operatorAdminId: "admin-1",
      idempotencyKey: "reissue-1",
      now: new Date("2026-08-14T02:00:00.000Z")
    });
    expect(result.replayed).toBe(false);
    expect(result.deletionQueryToken).toBeTruthy();
    expect(tx.deletionRequest.update).toHaveBeenCalled();
  });

  it("rejects a query-token reissue when the confirmed user does not match", async () => {
    const prisma = {
      deletionQueryTokenReissue: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (fn: (client: {
        $queryRaw: unknown;
        deletionRequest: { findUnique: ReturnType<typeof vi.fn> };
      }) => Promise<unknown>) =>
        fn({
          $queryRaw: vi.fn(),
          deletionRequest: {
            findUnique: vi.fn().mockResolvedValue({
              id: "del-1",
              userId: user.id
            })
          }
        })
    };
    await expect(
      reissueDeletionQueryToken(prisma as never, {
        deletionRequestId: "del-1",
        userId: "other-user",
        reason: "用户遗失查询令牌",
        approvalNote: "工单 CS-1 已核验微焦号",
        operatorAdminId: "admin-1",
        idempotencyKey: "reissue-1"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.DELETION_IDENTITY_MISMATCH });
  });

  it("replays a query-token reissue without returning a new token", async () => {
    const prisma = {
      deletionQueryTokenReissue: {
        findUnique: vi.fn().mockResolvedValue({
          deletionRequestId: "del-1",
          confirmedUserId: user.id,
          reason: "用户遗失查询令牌",
          approvalNote: "工单 CS-1 已核验微焦号",
          operatorAdminId: "admin-1"
        })
      },
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: "del-1",
          status: "PENDING",
          tokenExpiresAt: new Date("2026-09-13T00:00:00.000Z")
        })
      },
      $transaction: vi.fn()
    };
    const result = await reissueDeletionQueryToken(prisma as never, {
      deletionRequestId: "del-1",
      userId: user.id,
      reason: "用户遗失查询令牌",
      approvalNote: "工单 CS-1 已核验微焦号",
      operatorAdminId: "admin-1",
      idempotencyKey: "reissue-1"
    });
    expect(result).toMatchObject({ deletionRequestId: "del-1", replayed: true });
    expect(result.deletionQueryToken).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
