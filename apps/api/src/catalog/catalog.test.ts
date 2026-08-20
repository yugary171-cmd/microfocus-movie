import { describe, expect, it, vi } from "vitest";
import { SEARCH_MAX_PAGE, SEARCH_PAGE_SIZE, ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { CatalogController, publicSearchWhere, resolvePublicSearchTagFilter } from "./catalog.module.js";
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

  it("resolves filter names to catalog tag ids and fail-closes unknown names", async () => {
    const prisma = {
      catalogTag: {
        findMany: vi.fn().mockResolvedValue([
          { id: "ctag_001", group: "subjects", name: "现代" },
          { id: "ctag_041", group: "backgrounds", name: "现代" }
        ])
      }
    };
    const filter = await resolvePublicSearchTagFilter(prisma, { subject: "现代" });
    expect(filter).toEqual([["ctag_001"]]);
    expect(publicSearchWhere("", "", {}, filter)).toMatchObject({
      AND: [{ tagsJson: { array_contains: "ctag_001" } }]
    });
    prisma.catalogTag.findMany.mockResolvedValue([]);
    const missing = await resolvePublicSearchTagFilter(prisma, { background: "不存在" });
    expect(publicSearchWhere("", "", {}, missing)).toMatchObject({ id: { in: [] } });
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

  it("rejects an oversized drama id after the IP bucket is consumed", async () => {
    const prisma = {
      rateLimitBucket: allowRateLimit(),
      drama: { findFirst: vi.fn() }
    };
    const controller = new CatalogController(prisma as never);
    await expect(
      controller.detail({ socket: { remoteAddress: "10.0.0.8" } }, "d".repeat(ENTITY_ID_MAX_LENGTH + 1))
    ).rejects.toMatchObject({ code: "INVALID_ENTITY_ID" });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalled();
    expect(prisma.drama.findFirst).not.toHaveBeenCalled();
  });
});

describe("public catalog shelves", () => {
  it("loads latest by publish time instead of reshuffling the ranked shelf", async () => {
    const prisma = {
      rateLimitBucket: allowRateLimit(),
      drama: { findMany: vi.fn().mockResolvedValue([]) },
      catalogTag: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const controller = new CatalogController(prisma as never);
    const catalog = await controller.catalog({ socket: { remoteAddress: "10.0.0.8" } });
    expect(catalog.filterOptions).toEqual({ subjects: [], settings: [], backgrounds: [] });
    expect(prisma.catalogTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" })
      })
    );
    expect(prisma.drama.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 20,
        orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }, { id: "desc" }]
      })
    );
    expect(prisma.drama.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 20,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }]
      })
    );
  });
});
