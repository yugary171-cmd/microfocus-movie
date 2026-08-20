import {
  AdminRole,
  CatalogTagStatus,
  ERROR_CODES,
  PUBLIC_CATALOG_TAG_GROUPS
} from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module.js";

const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };
const editor = { kind: "admin" as const, sub: "editor-1", role: AdminRole.EDITOR };

function controller(prisma: object) {
  return new AdminController(prisma as never, {} as never, {} as never, {} as never);
}

describe("admin catalog tags", () => {
  it("lets any signed-in admin list active tags and only ADMIN include archived", async () => {
    const rows = [
      { id: "ctag_1", group: "audiences", name: "男频", status: CatalogTagStatus.ACTIVE, sortOrder: 500 },
      { id: "ctag_2", group: "subjects", name: "都市", status: CatalogTagStatus.ACTIVE, sortOrder: 1 }
    ];
    const prisma = {
      catalogTag: {
        findMany: vi.fn().mockResolvedValue(rows)
      }
    };
    const api = controller(prisma);
    const listed = await api.catalogTags(editor);
    expect(listed.items.map((tag) => tag.group)).toEqual(["subjects", "audiences"]);
    expect(prisma.catalogTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: CatalogTagStatus.ACTIVE } })
    );

    await expect(api.catalogTags(editor, "1")).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await api.catalogTags(admin, "1");
    expect(prisma.catalogTag.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("rejects duplicate names in the same group and unknown drama tags", async () => {
    const prisma = {
      catalogTag: {
        aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 3 } }),
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        findMany: vi.fn().mockResolvedValue([{ name: "都市" }])
      },
      drama: { create: vi.fn() },
      auditLog: { create: vi.fn() }
    };
    const api = controller(prisma);
    await expect(api.createCatalogTag(admin, { group: "subjects", name: "都市" })).rejects.toMatchObject({
      code: ERROR_CODES.CATALOG_TAG_DUPLICATE
    });
    await expect(
      api.createDrama(editor, {
        title: "测",
        summary: "简介",
        coverUrl: "https://example.invalid/cover.jpg",
        category: "真人剧",
        tags: ["ctag_042", "draft"],
        recommendationRank: 0,
        episodes: [{ episodeNumber: 1, title: "第1集", durationSeconds: 60 }]
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.CATALOG_TAG_NOT_IN_LIBRARY });
    expect(prisma.drama.create).not.toHaveBeenCalled();
  });

  it("archives a tag without rewriting drama tagsJson", async () => {
    const existing = {
      id: "ctag_1",
      group: "audiences",
      name: "男频",
      status: CatalogTagStatus.ACTIVE,
      sortOrder: 1
    };
    const prisma = {
      catalogTag: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({ ...existing, status: CatalogTagStatus.ARCHIVED })
      },
      drama: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() }
    };
    const api = controller(prisma);
    const updated = await api.patchCatalogTag(admin, "ctag_1", { status: CatalogTagStatus.ARCHIVED });
    expect(updated.status).toBe(CatalogTagStatus.ARCHIVED);
    expect(prisma.drama.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CATALOG_TAG_STATUS_CHANGED" })
      })
    );
  });

  it("deletes an unused tag and requires replacement when dramas still reference it", async () => {
    const unused = {
      id: "ctag_free",
      group: "tones",
      name: "赛博",
      status: CatalogTagStatus.ACTIVE,
      sortOrder: 1
    };
    const inUse = {
      id: "ctag_042",
      group: "backgrounds",
      name: "都市",
      status: CatalogTagStatus.ACTIVE,
      sortOrder: 201
    };
    const replacement = {
      id: "ctag_044",
      group: "backgrounds",
      name: "乡村",
      status: CatalogTagStatus.ACTIVE,
      sortOrder: 203
    };
    const prisma = {
      catalogTag: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === unused.id) return unused;
          if (where.id === inUse.id) return inUse;
          if (where.id === replacement.id) return replacement;
          return null;
        }),
        delete: vi.fn().mockResolvedValue(unused)
      },
      drama: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([{ id: "drama-1", tagsJson: ["ctag_042"] }]),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(1)
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma))
    };
    const api = controller(prisma);

    await expect(api.deleteCatalogTag(admin, unused.id)).resolves.toMatchObject({
      id: unused.id,
      rewrittenDramas: 0
    });
    expect(prisma.catalogTag.delete).toHaveBeenCalledWith({ where: { id: unused.id } });

    await expect(api.deleteCatalogTag(admin, inUse.id)).rejects.toMatchObject({
      code: ERROR_CODES.CATALOG_TAG_IN_USE
    });
    await api.deleteCatalogTag(admin, inUse.id, { replacementTagId: replacement.id });
    expect(prisma.drama.update).toHaveBeenCalledWith({
      where: { id: "drama-1" },
      data: { tagsJson: ["ctag_044"] }
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CATALOG_TAG_DELETED" })
      })
    );

    const tagged = await api.catalogTag(admin, inUse.id);
    expect(tagged.usageCount).toBe(1);
  });
});

describe("public catalog tag groups", () => {
  it("keeps home filters on the three open groups", () => {
    expect(PUBLIC_CATALOG_TAG_GROUPS).toEqual(["subjects", "settings", "backgrounds"]);
  });
});
