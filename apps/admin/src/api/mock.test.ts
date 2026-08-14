import { ADMIN_LIST_MAX_PAGE, DramaStatus, MediaStatus } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { mockApi } from "./mock";
import type { DramaInput } from "@/types/admin";

describe("mock admin publish path", () => {
  it("runs a drama from draft to published with ready media and rights evidence", async () => {
    const input: DramaInput = {
      title: "Mock 发布验收剧",
      summary: "用于验证管理端发布主路径。",
      category: "都市",
      tags: ["验收"],
      coverUrl: "",
      rightsHolder: "Mock 内容方",
      licenseNumber: "MOCK-2026-001",
      rightsValidFrom: "2026-01-01",
      licenseExpiresAt: "2028-12-31",
      rightsReportNumber: "MOCK-REPORT-001",
      rightsMaterialObjectKey: "rights/mock-publish/license.pdf",
      rightsMaterialDigestSha256: "a".repeat(64),
      allowsWechatDistribution: true,
      allowsAdMonetization: true,
      allowsTranscoding: true,
      allowsPromotionalMaterial: true,
      episodes: [
        {
          id: "mock-publish-episode-1",
          episodeNumber: 1,
          title: "第一集",
          durationSeconds: 120,
          mediaStatus: MediaStatus.READY,
        },
      ],
    };

    const saved = await mockApi.saveDrama(input);
    expect(saved.status).toBe(DramaStatus.DRAFT);
    expect(saved.episodes[0]).toMatchObject({
      mediaStatus: MediaStatus.READY,
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED",
      manualReviewStatus: "APPROVED",
      wechatReviewStatus: "APPROVED",
    });

    await mockApi.submitReview(saved.id);
    const review = (await mockApi.listReviews()).items.find((item) => item.dramaId === saved.id);
    expect(review?.status).toBe("PENDING");
    await mockApi.review(review!.id, true, "Mock 验收通过");
    expect((await mockApi.getDrama(saved.id)).status).toBe(DramaStatus.READY);

    await mockApi.publish(saved.id);
    const published = await mockApi.getDrama(saved.id);
    expect(published).toMatchObject({
      status: DramaStatus.PUBLISHED,
      contentApproved: true,
      copyrightVerified: true,
      wechatApproved: true,
    });
  });

  it("returns an empty page past the admin list cap without slicing a large offset", async () => {
    await expect(mockApi.listDramas("", "", ADMIN_LIST_MAX_PAGE + 1)).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(mockApi.listReviews(ADMIN_LIST_MAX_PAGE + 1)).resolves.toEqual({
      items: [],
      total: 0,
    });
    await expect(mockApi.listAuditLogs("", ADMIN_LIST_MAX_PAGE + 1)).resolves.toEqual({
      items: [],
      total: 0,
    });
  });
});
