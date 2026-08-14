import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { HistoryController } from "./history.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

describe("history routes", () => {
  it("exposes progress as PUT on the shared route", () => {
    const handler = HistoryController.prototype.progress;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(API_ROUTES.progress.replace(/^\//, ""));
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PUT);
  });

  it("rate-limits progress writes by authenticated user", async () => {
    expect(RATE_LIMITS.watchProgress).toEqual({ limit: 60, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      episode: { findFirst: vi.fn() }
    };
    const controller = new HistoryController(prisma as never);

    await expect(
      controller.progress({ kind: "user", sub: "user-1" } as never, {
        dramaId: "drama-1",
        episodeId: "episode-1",
        mediaPositionSeconds: 12
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("watchProgress", "user:user-1")
        })
      })
    );
    expect(prisma.episode.findFirst).not.toHaveBeenCalled();
  });

  it("rate-limits history reads by authenticated user", async () => {
    expect(RATE_LIMITS.watchHistory).toEqual({ limit: 30, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      watchProgress: { findMany: vi.fn() }
    };
    const controller = new HistoryController(prisma as never);
    await expect(
      controller.history({ kind: "user", sub: "user-1" } as never)
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("watchHistory", "user:user-1")
        })
      })
    );
    expect(prisma.watchProgress.findMany).not.toHaveBeenCalled();
  });
});
