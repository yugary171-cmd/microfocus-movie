import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES, ERROR_CODES, uniqueHistoryDramaIds } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { HistoryController } from "./history.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function limitedPrisma() {
  return {
    rateLimitBucket: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    watchProgress: {
      findMany: vi.fn(),
      deleteMany: vi.fn()
    },
    $transaction: vi.fn()
  };
}

describe("delete watch history", () => {
  it("exposes history deletion as DELETE on the shared route", () => {
    const handler = HistoryController.prototype.deleteHistory;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(API_ROUTES.history.replace(/^\//, ""));
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.DELETE);
  });

  it("deduplicates trimmed drama ids and drops blank or overlong values", () => {
    expect(uniqueHistoryDramaIds([" a ", "a", "  ", `${"x".repeat(192)}`])).toEqual(["a"]);
  });

  it("rate-limits history deletes by authenticated user", async () => {
    expect(RATE_LIMITS.watchHistoryDelete).toEqual({ limit: 20, windowMs: 60_000 });
    const prisma = limitedPrisma();
    const controller = new HistoryController(prisma as never);
    await expect(
      controller.deleteHistory({ kind: "user", sub: "user-1" } as never, {
        dramaIds: ["drama-1"]
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("watchHistoryDelete", "user:user-1")
        })
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects viewer tokens before mutating progress", async () => {
    const prisma = limitedPrisma();
    const controller = new HistoryController(prisma as never);
    await expect(
      controller.deleteHistory({ kind: "viewer", sub: "viewer-1" } as never, {
        dramaIds: ["drama-1"]
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.USER_TOKEN_REQUIRED });
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deletes only the caller's matching progress and is idempotent for missing ids", async () => {
    const watchProgress = {
      findMany: vi.fn().mockResolvedValue([{ dramaId: "drama-1" }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 })
    };
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      watchProgress,
      $transaction: async (fn: (client: { watchProgress: typeof watchProgress }) => Promise<unknown>) =>
        fn({ watchProgress })
    };
    const controller = new HistoryController(prisma as never);
    await expect(
      controller.deleteHistory({ kind: "user", sub: "user-1" } as never, {
        dramaIds: ["drama-1", "drama-1", "missing"]
      })
    ).resolves.toEqual({ deletedDramaIds: ["drama-1"] });
    expect(watchProgress.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", dramaId: { in: ["drama-1", "missing"] } },
      select: { dramaId: true }
    });
    expect(watchProgress.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", dramaId: { in: ["drama-1"] } }
    });
  });

  it("does not delete when none of the requested ids belong to the caller", async () => {
    const watchProgress = {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn()
    };
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      watchProgress,
      $transaction: async (fn: (client: { watchProgress: typeof watchProgress }) => Promise<unknown>) =>
        fn({ watchProgress })
    };
    const controller = new HistoryController(prisma as never);
    await expect(
      controller.deleteHistory({ kind: "user", sub: "user-1" } as never, {
        dramaIds: ["other-user-drama"]
      })
    ).resolves.toEqual({ deletedDramaIds: [] });
    expect(watchProgress.deleteMany).not.toHaveBeenCalled();
  });
});
