import { CallbackEventStatus, ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { replayCallbackEvent } from "./callback-replay.js";

const replayRow = {
  id: "replay-1",
  eventId: "event-1",
  reason: "修复验签时钟后重放",
  approvalNote: "INC-9",
  operatorAdminId: "admin-1"
};

describe("callback replay", () => {
  it("returns the original replay on the same idempotency key", async () => {
    const prisma = {
      callbackReplay: {
        findUnique: vi.fn().mockResolvedValue(replayRow)
      },
      callbackEvent: {
        findUnique: vi.fn().mockResolvedValue({
          status: CallbackEventStatus.PROCESSING,
          attempts: 5
        })
      },
      $transaction: vi.fn()
    };
    const result = await replayCallbackEvent(prisma as unknown as PrismaService, {
      eventId: "event-1",
      reason: "修复验签时钟后重放",
      approvalNote: "INC-9",
      idempotencyKey: "r:1",
      operatorAdminId: "admin-1"
    });
    expect(result).toEqual({
      eventId: "event-1",
      status: CallbackEventStatus.PROCESSING,
      attempts: 5,
      replayed: true
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("unlocks a dead-letter event without resetting attempts", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      callbackEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "event-1",
          status: CallbackEventStatus.DEAD_LETTER,
          attempts: 5,
          processedAt: null
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      callbackReplay: {
        create: vi.fn().mockResolvedValue(replayRow)
      }
    };
    const prisma = {
      callbackReplay: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const result = await replayCallbackEvent(prisma as unknown as PrismaService, {
      eventId: "event-1",
      reason: "修复验签时钟后重放",
      approvalNote: "INC-9",
      idempotencyKey: "r:1",
      operatorAdminId: "admin-1"
    });
    expect(result.replayed).toBe(false);
    expect(result.attempts).toBe(5);
    expect(result.status).toBe(CallbackEventStatus.PROCESSING);
    expect(tx.callbackEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CallbackEventStatus.PROCESSING,
          processingUntil: null,
          processedAt: null
        })
      })
    );
  });

  it("rejects processed events", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      callbackEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "event-1",
          status: CallbackEventStatus.PROCESSED,
          attempts: 1,
          processedAt: new Date()
        }),
        updateMany: vi.fn()
      },
      callbackReplay: { create: vi.fn() }
    };
    const prisma = {
      callbackReplay: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    await expect(
      replayCallbackEvent(prisma as unknown as PrismaService, {
        eventId: "event-1",
        reason: "误操作重放已完成事件",
        idempotencyKey: "r:2",
        operatorAdminId: "admin-1"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.CALLBACK_NOT_REPLAYABLE });
    expect(tx.callbackEvent.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key with a different payload", async () => {
    const prisma = {
      callbackReplay: { findUnique: vi.fn().mockResolvedValue(replayRow) },
      callbackEvent: { findUnique: vi.fn() },
      $transaction: vi.fn()
    };
    await expect(
      replayCallbackEvent(prisma as unknown as PrismaService, {
        eventId: "event-2",
        reason: "修复验签时钟后重放",
        approvalNote: "INC-9",
        idempotencyKey: "r:1",
        operatorAdminId: "admin-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
