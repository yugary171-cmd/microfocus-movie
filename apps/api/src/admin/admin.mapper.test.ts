import { describe, expect, it } from "vitest";
import { RIGHTS_MATERIAL_DIGEST_LENGTH } from "@microfocus/contracts";
import { toAdminDrama } from "./admin.module.js";

function fixture() {
  return {
    id: "drama",
    title: "Drama",
    summary: "Summary",
    category: "Urban",
    tagsJson: ["tag"],
    coverUrl: "https://example.invalid/cover.jpg",
    promoCoverUrl: "https://example.invalid/promo.jpg",
    status: "READY",
    contentVersion: 3,
    editorId: "editor",
    editor: { email: "editor@example.invalid" },
    updatedAt: new Date("2026-08-12T00:00:00Z"),
    rightsRecords: [
      {
        rightsHolder: "Holder",
        licenseNumber: "license",
        validFrom: new Date("2026-01-01T00:00:00Z"),
        validUntil: new Date("2027-01-01T00:00:00Z"),
        reportNumber: "report",
        materialObjectKey: "private/rights.pdf",
        materialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
        allowsWechatDistribution: true,
        allowsAdMonetization: true,
        allowsTranscoding: true,
        allowsPromotionalMaterial: true
      }
    ],
    reviews: [{ status: "APPROVED", contentVersion: 3 }],
    episodes: [
      {
        id: "episode",
        episodeNumber: 1,
        title: "Episode",
        durationSeconds: 120,
        updatedAt: new Date("2026-08-12T00:00:00Z"),
        mediaAssets: [
          {
            id: "asset",
            fileId: "vod-file",
            mediaStatus: "READY",
            transcodeStatus: "READY",
            machineReviewStatus: "APPROVED",
            manualReviewStatus: "APPROVED",
            wechatReviewStatus: "APPROVED"
          }
        ]
      }
    ]
  };
}

describe("admin drama mapper", () => {
  it("flattens current rights, matching content review and current media state", () => {
    const result = toAdminDrama(fixture());
    expect(result).toMatchObject({
      contentApproved: true,
      wechatApproved: true,
      promoCoverUrl: "https://example.invalid/promo.jpg",
      rightsValidFrom: "2026-01-01T00:00:00.000Z",
      rightsValidUntil: "2027-01-01T00:00:00.000Z",
      rightsReportNumber: "report",
      rightsMaterialObjectKey: "private/rights.pdf",
      rightsMaterialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
      allowsWechatDistribution: true,
      allowsAdMonetization: true,
      allowsTranscoding: true,
      allowsPromotionalMaterial: true
    });
    expect(result.episodes[0]).toMatchObject({
      assetId: "asset",
      mediaStatus: "READY",
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED",
      manualReviewStatus: "APPROVED",
      wechatReviewStatus: "APPROVED"
    });
  });

  it("does not reuse an approval from an older content version", () => {
    const input = fixture();
    input.reviews[0]!.contentVersion = 2;
    input.episodes[0]!.mediaAssets[0]!.manualReviewStatus = "REJECTED";
    const result = toAdminDrama(input);
    expect(result.contentApproved).toBe(false);
    expect(result.wechatApproved).toBe(false);
  });
});
