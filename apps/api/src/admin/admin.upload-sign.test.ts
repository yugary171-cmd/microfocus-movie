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

function controller(prisma: object, vod: object, cos: object = {}) {
  return new AdminController(prisma as never, {} as never, vod as never, {} as never, cos as never);
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
    expect(API_ROUTES.admin.posterUploadSign).toBe("/v1/admin/poster-uploads/sign");
    expect(API_ROUTES.admin.posterUploadComplete).toBe("/v1/admin/poster-uploads/complete");
    expect(API_ROUTES.admin.uploadCapabilities).toBe("/v1/admin/upload-capabilities");
  });

  it("audits a successful upload sign without storing the signed URL", async () => {
    const prisma = {
      episode: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ep-1",
          dramaId: "drama-1",
          episodeNumber: 7,
          drama: { status: "DRAFT", editorId: "editor-1" }
        })
      },
      uploadSession: { create: vi.fn().mockResolvedValue({}) },
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
      data: expect.objectContaining({
        adminId: "editor-1",
        action: "UPLOAD_SIGNED",
        targetType: "Episode",
        targetId: "ep-1",
        metadataJson: {
          dramaId: "drama-1",
          episodeId: "ep-1",
          episodeNumber: 7,
          fileName: "episode.mp4",
          size: 12,
          contentType: "video/mp4",
          uploadId: "up-1",
          uploadPhase: "SIGN_REQUESTED"
        }
      })
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
      uploadSession: { create: vi.fn() },
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

  it("issues a pending poster session before a new drama has an id", async () => {
    const signedPoster = {
      uploadId: "poster-1",
      uploadUrl: "https://cos.example/upload",
      headers: { "Content-Type": "image/png" },
      objectKey: "microfocus/dramas/pending/cover/poster-1/cover.png",
      assetUrl: "https://cdn.example/poster.png",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      mock: false
    };
    const prisma = {
      uploadSession: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const cos = { createPosterUploadAuthorization: vi.fn().mockResolvedValue(signedPoster) };
    const result = await controller(prisma, {}, cos).posterUploadSign(editor, {
      kind: "cover",
      fileName: "cover.png",
      size: 12,
      contentType: "image/png"
    } as never);

    expect(result).toEqual(signedPoster);
    expect(prisma.uploadSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "COS",
        kind: "POSTER_COVER",
        dramaId: null,
        uploadId: "poster-1"
      })
    });
  });

  it("completes a mock/live-verified poster session idempotently by upload id", async () => {
    const session = {
      id: "session-1",
      uploadId: "poster-1",
      adminId: "editor-1",
      provider: "COS",
      objectKey: "microfocus/dramas/pending/cover/poster-1/cover.png",
      dramaId: null,
      status: "ISSUED",
      expiresAt: new Date(Date.now() + 60_000),
      size: BigInt(12),
      contentType: "image/png"
    };
    const prisma = {
      uploadSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const cos = {
      inspectObject: vi.fn().mockResolvedValue({ contentLength: 12, contentType: "image/png" }),
      assetUrlForObjectKey: vi.fn().mockReturnValue("https://cdn.example/poster.png")
    };
    await expect(
      controller(prisma, {}, cos).posterUploadComplete(editor, { uploadId: "poster-1" } as never)
    ).resolves.toEqual({ uploadId: "poster-1", assetUrl: "https://cdn.example/poster.png" });
    expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "COMPLETED", completedAt: expect.any(Date) } })
    );
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain("https://cos.example");
  });

  it("audits media registration with the episode and version context", async () => {
    const prisma = {
      drama: {
        findUnique: vi.fn().mockResolvedValue({ id: "drama-1", editorId: "editor-1", status: "DRAFT", contentVersion: 1 }),
        update: vi.fn().mockResolvedValue({})
      },
      episode: {
        findFirst: vi.fn().mockResolvedValue({ id: "ep-1", episodeNumber: 7 }),
      },
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue(null),
        aggregate: vi.fn().mockResolvedValue({ _max: { version: 2 } }),
        updateMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({
          id: "asset-1",
          episodeId: "ep-1",
          version: 3,
          fileId: "vod-file-1"
        })
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    const result = await controller(prisma, {}).addMedia(editor, "drama-1", {
      episodeId: "ep-1",
      fileId: "vod-file-1"
    } as never);

    expect(result).toMatchObject({ id: "asset-1", version: 3 });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MEDIA_REGISTERED",
        metadataJson: {
          dramaId: "drama-1",
          episodeId: "ep-1",
          episodeNumber: 7,
          mediaAssetId: "asset-1",
          mediaVersion: 3,
          fileId: "vod-file-1",
          uploadPhase: "MEDIA_REGISTERED"
        }
      })
    });
  });
});
