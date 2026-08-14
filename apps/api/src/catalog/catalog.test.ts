import { describe, expect, it, vi } from "vitest";
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

describe("catalog search filters", () => {
  it("supports category-only search when q is empty", () => {
    const where = publicSearchWhere("", "都市");
    expect(where).toMatchObject({ status: "PUBLISHED", category: "都市" });
    expect(where).not.toHaveProperty("OR");
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
