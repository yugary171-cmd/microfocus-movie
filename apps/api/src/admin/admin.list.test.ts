import { ADMIN_LIST_MAX_PAGE, ADMIN_LIST_PAGE_SIZE, AdminRole, ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module.js";

const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };
const editor = { kind: "admin" as const, sub: "editor-1", role: AdminRole.EDITOR };

function controller(prisma: object) {
  return new AdminController(prisma as never, {} as never, {} as never, {} as never);
}

describe("admin list pagination", () => {
  it("returns empty drama, review, and audit pages past the max page without a large offset", async () => {
    const prisma = {
      $transaction: vi.fn(),
      drama: { findMany: vi.fn(), count: vi.fn() },
      auditLog: { findMany: vi.fn(), count: vi.fn() }
    };
    const api = controller(prisma);
    const page = String(ADMIN_LIST_MAX_PAGE + 1);
    await expect(api.dramas(admin, undefined, "", page)).resolves.toEqual({
      items: [],
      page: ADMIN_LIST_MAX_PAGE + 1,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      total: 0,
      totalPages: 0
    });
    await expect(api.reviews(page)).resolves.toMatchObject({
      items: [],
      page: ADMIN_LIST_MAX_PAGE + 1,
      total: 0
    });
    await expect(api.auditLogs("", page)).resolves.toEqual({
      items: [],
      page: ADMIN_LIST_MAX_PAGE + 1,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      total: 0,
      totalPages: 0
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("queries a bounded drama page, server-side keyword, and editor scope", async () => {
    const prisma = {
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      drama: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    };
    await controller(prisma).dramas(editor, "DRAFT", "微焦", "2");
    expect(prisma.drama.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: ADMIN_LIST_PAGE_SIZE,
        take: ADMIN_LIST_PAGE_SIZE,
        where: expect.objectContaining({
          editorId: "editor-1",
          status: "DRAFT",
          OR: [{ title: { contains: "微焦" } }, { editor: { email: { contains: "微焦" } } }]
        })
      })
    );
    expect(prisma.drama.count).toHaveBeenCalled();
  });

  it("truncates the drama keyword before querying", async () => {
    const prisma = {
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      drama: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    };
    const q = "x".repeat(120);
    await controller(prisma).dramas(admin, undefined, q, "1");
    expect(prisma.drama.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ title: { contains: "x".repeat(100) } }, { editor: { email: { contains: "x".repeat(100) } } }]
        })
      })
    );
  });

  it("queries a bounded audit page and searches actor email", async () => {
    const prisma = {
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    };
    await controller(prisma).auditLogs("admin@example.com", "2");
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: ADMIN_LIST_PAGE_SIZE,
        take: ADMIN_LIST_PAGE_SIZE,
        where: {
          OR: [
            { action: { contains: "admin@example.com" } },
            { targetType: { contains: "admin@example.com" } },
            { targetId: { contains: "admin@example.com" } },
            { requestId: { contains: "admin@example.com" } },
            { admin: { email: { contains: "admin@example.com" } } }
          ]
        }
      })
    );
    expect(prisma.auditLog.count).toHaveBeenCalled();
  });

  it("truncates the audit keyword before querying", async () => {
    const prisma = {
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0)
      }
    };
    const q = "x".repeat(120);
    await controller(prisma).auditLogs(q, "1");
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([{ action: { contains: "x".repeat(100) } }])
        }
      })
    );
  });

  it("rejects an oversized drama id without a database lookup", async () => {
    const prisma = { drama: { findUnique: vi.fn() } };
    await expect(controller(prisma).drama(admin, "d".repeat(ENTITY_ID_MAX_LENGTH + 1))).rejects.toMatchObject({
      code: "INVALID_ENTITY_ID"
    });
    expect(prisma.drama.findUnique).not.toHaveBeenCalled();
  });
});
