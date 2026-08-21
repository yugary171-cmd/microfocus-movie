import { AdminRole } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module.js";

const editor = { kind: "admin" as const, sub: "editor-1", role: AdminRole.EDITOR };
const otherEditor = { kind: "admin" as const, sub: "editor-2", role: AdminRole.EDITOR };
const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };

function controller(prisma: object) {
  return new AdminController(prisma as never, {} as never, {} as never, {} as never);
}

function drama(editorId: string) {
  return { id: "drama-1", editorId, status: "PENDING_REVIEW", contentVersion: 1 };
}

function reviewPrisma(currentDrama: object) {
  return {
    drama: {
      findUnique: vi.fn().mockResolvedValue(currentDrama),
      update: vi.fn().mockResolvedValue({})
    },
    dramaReview: {
      create: vi.fn().mockResolvedValue({ id: "review-1", status: "APPROVED" })
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) }
  };
}

describe("admin content review ownership", () => {
  it("blocks an editor from reviewing another editor's drama without writing facts", async () => {
    const prisma = reviewPrisma(drama(otherEditor.sub));

    await expect(
      controller(prisma).review(editor, "drama-1", { status: "APPROVED" } as never)
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
    expect(prisma.dramaReview.create).not.toHaveBeenCalled();
    expect(prisma.drama.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows the owner and ADMIN to review", async () => {
    for (const principal of [editor, admin]) {
      const prisma = reviewPrisma(drama(editor.sub));
      await expect(
        controller(prisma).review(principal, "drama-1", { status: "APPROVED" } as never)
      ).resolves.toMatchObject({ id: "review-1" });
      expect(prisma.dramaReview.create).toHaveBeenCalledOnce();
      expect(prisma.drama.update).toHaveBeenCalledOnce();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "DRAMA_APPROVED",
          metadataJson: expect.objectContaining({
            dramaId: "drama-1",
            contentVersion: 1,
            reviewStatus: "APPROVED",
            fromStatus: "PENDING_REVIEW",
            toStatus: "READY"
          })
        })
      });
    }
  });
});

function mediaPrisma(editorId: string) {
  return {
    mediaAsset: {
      findFirst: vi.fn().mockResolvedValue({
        id: "asset-1",
        episodeId: "episode-1",
        version: 3,
        manualReviewStatus: "PENDING",
        wechatReviewStatus: "PENDING",
        episode: {
          id: "episode-1",
          episodeNumber: 4,
          dramaId: "drama-1",
          drama: { id: "drama-1", editorId, status: "DRAFT" }
        }
      }),
      update: vi.fn().mockResolvedValue({ id: "asset-1", manualReviewStatus: "APPROVED" })
    },
    drama: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) }
  };
}

describe("admin media review ownership", () => {
  it("blocks an editor from reviewing another editor's media asset", async () => {
    const prisma = mediaPrisma(otherEditor.sub);

    await expect(
      controller(prisma).reviewMedia(editor, "asset-1", {
        manualReviewStatus: "APPROVED",
        notes: "媒体审核说明"
      } as never)
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
    expect(prisma.mediaAsset.update).not.toHaveBeenCalled();
    expect(prisma.drama.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows the owner and ADMIN to review media assets", async () => {
    for (const principal of [editor, admin]) {
      const prisma = mediaPrisma(editor.sub);
      await expect(
        controller(prisma).reviewMedia(principal, "asset-1", {
          manualReviewStatus: "APPROVED",
          notes: "媒体审核说明"
        } as never)
      ).resolves.toMatchObject({ id: "asset-1" });
      expect(prisma.mediaAsset.update).toHaveBeenCalledOnce();
      expect(prisma.drama.update).toHaveBeenCalledOnce();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "MEDIA_REVIEWED",
          metadataJson: expect.objectContaining({
            dramaId: "drama-1",
            episodeId: "episode-1",
            episodeNumber: 4,
            mediaAssetId: "asset-1",
            mediaVersion: 3,
            fromStatus: "manual:PENDING;wechat:PENDING",
            toStatus: "manual:APPROVED;wechat:PENDING",
            fromManualReviewStatus: "PENDING",
            toManualReviewStatus: "APPROVED"
          })
        })
      });
    }
  });
});
