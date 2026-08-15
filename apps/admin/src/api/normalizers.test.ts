import { AdminRole, DramaStatus, MediaStatus, RIGHTS_MATERIAL_DIGEST_LENGTH } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import {
  normalizeAdminSession,
  normalizeAuditList,
  normalizeCallbackEventList,
  normalizeCircuitBreaker,
  normalizeDashboard,
  normalizeDrama,
  normalizeReviewList,
  pageTotal,
} from "./normalizers";
import { publishDecision } from "@/policies/admin";
import { createGate, createUser } from "@/test/fixtures";

describe("admin API normalizers", () => {
  it("adapts the backend login administrator without inventing a display name", () => {
    expect(
      normalizeAdminSession({
        accessToken: "token-for-test",
        admin: { id: "admin-1", email: "admin@example.com", role: AdminRole.ADMIN },
      }),
    ).toEqual({
      accessToken: "token-for-test",
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "admin@example.com",
        role: AdminRole.ADMIN,
      },
    });
  });

  it("fails closed when drama approval evidence is absent", () => {
    const drama = normalizeDrama({
      id: "drama-1",
      title: "待校验剧目",
      status: "READY",
      editorId: "editor-1",
      tagsJson: ["测试", 12],
      episodes: [
        {
          id: "episode-1",
          episodeNumber: 1,
          title: "第一集",
          durationSeconds: 100,
          mediaAssets: [{ isCurrent: true, mediaStatus: "READY" }],
        },
      ],
    });

    expect(drama.status).toBe(DramaStatus.READY);
    expect(drama.tags).toEqual(["测试"]);
    expect(drama.episodes[0]?.mediaStatus).toBe(MediaStatus.READY);
    expect(drama.contentApproved).toBe(false);
    expect(drama.copyrightVerified).toBe(false);
    expect(drama.wechatApproved).toBe(false);
  });

  it("preserves flattened rights and allows an approved READY live fixture to publish", () => {
    const digest = "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH);
    const drama = normalizeDrama({
      id: "drama-live-ready",
      title: "已就绪短剧",
      summary: "真实响应夹具",
      category: "都市",
      tags: ["已审"],
      coverUrl: "https://media.example.com/cover.jpg",
      status: "READY",
      ownerId: "editor-1",
      ownerName: "editor@example.com",
      rightsHolder: "示例权利方",
      licenseNumber: "LICENSE-001",
      rightsValidFrom: "2026-01-01T00:00:00.000Z",
      licenseExpiresAt: "2028-01-01T00:00:00.000Z",
      rightsReportNumber: "REPORT-001",
      rightsMaterialObjectKey: "rights/drama-live-ready/license.pdf",
      rightsMaterialDigestSha256: digest,
      allowsWechatDistribution: true,
      allowsAdMonetization: true,
      allowsTranscoding: true,
      allowsPromotionalMaterial: true,
      contentApproved: true,
      copyrightVerified: true,
      wechatApproved: true,
      episodes: [
        {
          id: "episode-live-1",
          episodeNumber: 1,
          title: "第一集",
          durationSeconds: 120,
          mediaStatus: "READY",
          transcodeStatus: "READY",
          machineReviewStatus: "APPROVED",
          manualReviewStatus: "APPROVED",
          wechatReviewStatus: "APPROVED",
          vodFileId: "vod-file-1",
          updatedAt: "2026-08-12T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-08-12T00:00:00.000Z",
    });

    expect(drama).toMatchObject({
      rightsValidFrom: "2026-01-01T00:00:00.000Z",
      rightsReportNumber: "REPORT-001",
      rightsMaterialObjectKey: "rights/drama-live-ready/license.pdf",
      rightsMaterialDigestSha256: digest,
      allowsWechatDistribution: true,
      allowsAdMonetization: true,
      allowsTranscoding: true,
      allowsPromotionalMaterial: true,
      contentApproved: true,
      wechatApproved: true,
    });
    expect(publishDecision(createUser(AdminRole.ADMIN), drama, createGate())).toEqual({
      allowed: true,
      reason: "",
    });
  });

  it("combines dashboard counts with the fail-closed release gate", () => {
    const result = normalizeDashboard(
      { published: 4, pendingReviews: 2 },
      {
        entityApproved: true,
        miniProgramFilingApproved: true,
        wechatCategoryApproved: true,
        adsApproved: true,
        readyForExternalTraffic: false,
        blockers: ["VOD provider is not live"],
      },
    );

    expect(result.reviewBacklog).toBe(2);
    expect(result.statusCounts[DramaStatus.PUBLISHED]).toBe(4);
    expect(result.releaseGate.readyForExternalTraffic).toBe(false);
    expect(result.callbackOps).toEqual({
      deadLetterCount: 0,
      retryableCount: 0,
      oldestUnprocessedAgeSeconds: null,
      openProviderCircuits: [],
    });
    expect(result.ledgerOps).toEqual({
      mismatchCount: 0,
      mismatchedSeconds: 0,
      missingGrants: 0,
      lastReconciledAt: null,
      ledgerCircuitOpen: false,
    });
  });

  it("normalizes callback event lists without copying payload ciphertext", () => {
    const result = normalizeCallbackEventList({
      total: 1,
      items: [
        {
          eventId: "event-1",
          provider: "VOD",
          eventType: "MEDIA_UPDATED",
          status: "DEAD_LETTER",
          attempts: 5,
          receivedAt: "2026-08-14T10:00:00.000Z",
          payloadAvailable: true,
          replayable: true,
          payloadCiphertext: "must-not-copy",
        },
      ],
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      eventId: "event-1",
      payloadAvailable: true,
      replayable: true,
    });
    expect(JSON.stringify(result)).not.toContain("must-not-copy");
  });

  it("adapts pending drama rows into review items with an explicit unknown-risk warning", () => {
    const result = normalizeReviewList([
      {
        id: "drama-1",
        title: "待审剧目",
        editorId: "editor-1",
        editor: { id: "editor-1", email: "editor@example.com" },
        updatedAt: "2026-08-12T00:00:00.000Z",
      },
    ]);

    expect(result[0]).toMatchObject({
      id: "drama-1",
      dramaId: "drama-1",
      submitterId: "editor-1",
      status: "PENDING",
    });
    expect(result[0]?.riskFlags).toContain("自动风险标记未返回，请完整人工复核");
  });

  it("normalizes only the global circuit and leaves absent audit fields unknown", () => {
    expect(
      normalizeCircuitBreaker([
        { provider: "VOD", state: "OPEN", reason: "provider incident" },
        {
          provider: "GLOBAL:GLOBAL",
          state: "CLOSED",
          reason: "incident resolved",
          updatedAt: "2026-08-12T00:00:00.000Z",
          updatedBy: "admin-9",
        },
      ]),
    ).toMatchObject({ enabled: false, reason: "incident resolved", updatedBy: "admin-9" });

    expect(
      normalizeAuditList([
        {
          id: "audit-1",
          adminId: "admin-1",
          action: "DRAMA_PUBLISHED",
          targetType: "Drama",
          targetId: "drama-1",
          createdAt: "2026-08-12T00:00:00.000Z",
        },
      ])[0],
    ).toMatchObject({
      actorName: "admin-1",
      actorRole: null,
      result: "UNKNOWN",
      requestId: "",
    });
  });

  it("reads an explicit list total including zero", () => {
    expect(pageTotal({ items: [{ id: "drama-1" }], total: 120 }, 1)).toBe(120);
    expect(pageTotal({ items: [], total: 0 }, 0)).toBe(0);
    expect(pageTotal([{ id: "drama-1" }], 1)).toBe(1);
  });
});
