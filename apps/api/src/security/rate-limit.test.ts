import { describe, expect, it, vi } from "vitest";
import {
  assertRateLimit,
  pruneRateLimitBuckets,
  rateLimitBucketId,
  requestIpKey
} from "./rate-limit.js";

describe("request rate limit buckets", () => {
  it("uses the socket address instead of a client-supplied forwarded header", () => {
    expect(
      requestIpKey({
        ip: "1.2.3.4",
        socket: { remoteAddress: "10.0.0.8" }
      })
    ).toBe("10.0.0.8");
    expect(rateLimitBucketId("search", "10.0.0.8")).toMatch(/^search:[a-f0-9]{64}$/);
  });

  it("creates a bucket then rejects when the window is exhausted", async () => {
    const prisma = {
      rateLimitBucket: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 0 }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ windowStart: new Date("2026-08-14T12:00:00.000Z"), count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn()
      }
    };
    const now = new Date("2026-08-14T12:00:10.000Z");
    await expect(
      assertRateLimit(prisma, { scope: "search", key: "10.0.0.8", limit: 1, windowMs: 60_000, now })
    ).resolves.toBeUndefined();
    await expect(
      assertRateLimit(prisma, { scope: "search", key: "10.0.0.8", limit: 1, windowMs: 60_000, now })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("resets an elapsed window instead of carrying the old count", async () => {
    const oldWindow = new Date("2026-08-14T11:59:00.000Z");
    const prisma = {
      rateLimitBucket: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: oldWindow, count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    await expect(
      assertRateLimit(prisma, {
        scope: "search",
        key: "10.0.0.8",
        limit: 1,
        windowMs: 60_000,
        now: new Date("2026-08-14T12:00:10.000Z")
      })
    ).resolves.toBeUndefined();
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ count: 1 })
      })
    );
  });

  it("prunes buckets older than one day", async () => {
    const prisma = {
      rateLimitBucket: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 })
      }
    };
    await expect(pruneRateLimitBuckets(prisma, new Date("2026-08-14T00:00:00.000Z"))).resolves.toBe(
      3
    );
  });
});
