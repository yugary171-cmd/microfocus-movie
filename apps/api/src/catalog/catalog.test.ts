import { describe, expect, it, vi } from "vitest";
import { SEARCH_MAX_PAGE, SEARCH_PAGE_SIZE } from "@microfocus/contracts";
import { CatalogController, publicSearchWhere } from "./catalog.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function exhaustedBucket() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

function allowRateLimit() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

describe("catalog search filters", () => {
  it("supports category-only search when q is empty", () => {
    const where = publicSearchWhere("", "都市");
    expect(where).toMatchObject({ status: "PUBLISHED", category: "都市" });
    expect(where).not.toHaveProperty("OR");
  });

  it("returns empty search results past page 100 without a large offset", async () => {
    expect(SEARCH_PAGE_SIZE).toBe(20);
    expect(SEARCH_MAX_PAGE).toBe(100);
    const prisma = {
      rateLimitBucket: allowRateLimit(),
      $transaction: vi.fn(),
      drama: { findMany: vi.fn(), count: vi.fn() }
    };
    const controller = new CatalogController(prisma as never);
    const result = await controller.search(
      { socket: { remoteAddress: "10.0.0.8" } },
      "",
      "",
      "101"
    );
    expect(result).toEqual({
      items: [],
      page: 101,
      pageSize: SEARCH_PAGE_SIZE,
      total: 0,
      totalPages: 0
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
    expect(prisma.drama.count).not.toHaveBeenCalled();
  });

  it("queries the last allowed search page with a bounded offset", async () => {
    const prisma = {
      rateLimitBucket: allowRateLimit(),
      $transaction: vi.fn().mockResolvedValue([[], 0]),
      drama: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    };
    const controller = new CatalogController(prisma as never);
    await controller.search({ socket: { remoteAddress: "10.0.0.8" } }, "", "", "100");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.drama.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: (SEARCH_MAX_PAGE - 1) * SEARCH_PAGE_SIZE,
        take: SEARCH_PAGE_SIZE,
        orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }, { id: "desc" }]
      })
    );
  });
});

describe("public catalog rate limits", () => {
  it("limits catalog and drama detail by connection IP", async () => {
    expect(RATE_LIMITS.catalog).toEqual({ limit: 60, windowMs: 60_000 });
    expect(RATE_LIMITS.dramaDetail).toEqual({ limit: 60, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: exhaustedBucket(),
      drama: { findMany: vi.fn(), findFirst: vi.fn() }
    };
    const controller = new CatalogController(prisma as never);
    const request = { socket: { remoteAddress: "10.0.0.8" } };

    await expect(controller.catalog(request)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("catalog", "10.0.0.8")
        })
      })
    );
    expect(prisma.drama.findMany).not.toHaveBeenCalled();

    await expect(controller.detail(request, "drama-1")).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("dramaDetail", "10.0.0.8")
        })
      })
    );
    expect(prisma.drama.findFirst).not.toHaveBeenCalled();
  });
});
