import {
  DELETION_CONFIRMATION,
  ERROR_CODES
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createDeletionRequest, hashDeletionQueryToken, lookupDeletionRequest } from "./deletion.js";

const user = { id: "user-1", status: "ACTIVE", openId: "wx-open-id" };

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
});
