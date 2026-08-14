import { API_ROUTES, AdminRole } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module.js";

const editor = { kind: "admin" as const, sub: "editor-1", role: AdminRole.EDITOR };

const signed = {
  uploadUrl: "https://secret.example/upload?sig=abc",
  headers: { Authorization: "upload-token" },
  uploadId: "up-1",
  expiresAt: "2026-08-14T12:15:00.000Z",
  mock: true
};

function controller(prisma: object, vod: object) {
  return new AdminController(prisma as never, {} as never, vod as never, {} as never);
}

describe("admin upload sign audit", () => {
  it("exposes implemented admin write paths in contracts", () => {
    expect(API_ROUTES.admin.root).toBe("/v1/admin");
    expect(API_ROUTES.admin.rights("d1")).toBe("/v1/admin/dramas/d1/rights");
    expect(API_ROUTES.admin.mediaAssets("d1")).toBe("/v1/admin/dramas/d1/media-assets");
    expect(API_ROUTES.admin.mediaReview("a1")).toBe("/v1/admin/media-assets/a1/review");
    expect(API_ROUTES.admin.deletionRequests).toBe("/v1/admin/deletion-requests");
    expect(API_ROUTES.admin.circuitBreaker("VOD")).toBe("/v1/admin/circuit-breakers/VOD");
    expect(API_ROUTES.admin.uploadSign).toBe("/v1/admin/uploads/sign");
  });

  it("audits a successful upload sign without storing the signed URL", async () => {
    const prisma = {
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ep-1",
          dramaId: "drama-1",
          drama: { status: "DRAFT", editorId: "editor-1" }
        })
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const vod = {
      createUploadAuthorization: vi.fn().mockResolvedValue(signed)
    };
    const result = await controller(prisma, vod).uploadSign(editor, {
      dramaId: "drama-1",
      episodeId: "ep-1",
      fileName: "episode.mp4",
      size: 12,
      contentType: "video/mp4"
    } as never);

    expect(result).toEqual(signed);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "editor-1",
        action: "UPLOAD_SIGNED",
        targetType: "Episode",
        targetId: "ep-1",
        metadataJson: { dramaId: "drama-1" }
      }
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain("secret.example");
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain("upload-token");
  });

  it("does not audit when VOD signing stays fail-closed", async () => {
    const prisma = {
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ep-1",
          dramaId: "drama-1",
          drama: { status: "DRAFT", editorId: "editor-1" }
        })
      },
      auditLog: { create: vi.fn() }
    };
    const vod = {
      createUploadAuthorization: vi.fn().mockRejectedValue(new Error("Tencent Cloud VOD upload signing"))
    };
    await expect(
      controller(prisma, vod).uploadSign(editor, {
        dramaId: "drama-1",
        episodeId: "ep-1",
        fileName: "episode.mp4",
        size: 12,
        contentType: "video/mp4"
      } as never)
    ).rejects.toThrow("Tencent Cloud VOD upload signing");
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
