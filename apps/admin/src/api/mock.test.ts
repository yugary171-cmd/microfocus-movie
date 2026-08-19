import { ADMIN_LIST_MAX_PAGE, DRAMA_TITLE_MAX_LENGTH, AdminAccountStatus, AdminRole, DramaStatus, MediaStatus, RIGHTS_MATERIAL_DIGEST_LENGTH } from "@microfocus/contracts";
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
      rightsMaterialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
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

  it("rejects an oversized drama draft before storing mock state", async () => {
    await expect(
      mockApi.saveDrama({
        title: "x".repeat(DRAMA_TITLE_MAX_LENGTH + 1),
        summary: "简介",
        category: "都市",
        tags: [],
        coverUrl: "",
        rightsHolder: "",
        licenseNumber: "",
        rightsValidFrom: "",
        licenseExpiresAt: "",
        rightsReportNumber: "",
        rightsMaterialObjectKey: "",
        rightsMaterialDigestSha256: "",
        allowsWechatDistribution: false,
        allowsAdMonetization: false,
        allowsTranscoding: false,
        allowsPromotionalMaterial: false,
        episodes: [],
      }),
    ).rejects.toThrow("剧名不能超过");
  });

  it("persists account lifecycle state without storing entered credentials", async () => {
    const email = `reviewer-${crypto.randomUUID()}@example.com`;
    const link = await mockApi.createAccount({
      displayName: "王审核",
      email,
      role: AdminRole.REVIEWER,
      otp: "123456",
    });
    const token = new URLSearchParams(new URL(link.setupUrl).hash.replace(/^#/, "")).get("token");
    expect(token).toBeTruthy();
    await expect(mockApi.login(email, "123456", AdminRole.ADMIN)).rejects.toThrow("尚未开通");

    const setup = await mockApi.inspectAccountSetup(token!);
    expect(setup).toMatchObject({ displayName: "王审核", email, role: AdminRole.REVIEWER });
    await mockApi.completeAccountSetup(token!, "strong-password-2026", "123456");
    await expect(mockApi.inspectAccountSetup(token!)).rejects.toThrow("无效");

    const accounts = await mockApi.listAccounts(email, AdminRole.REVIEWER, AdminAccountStatus.ACTIVE, 1);
    expect(accounts.items).toHaveLength(1);
    expect(accounts.items[0]).toMatchObject({ email, status: "ACTIVE", totpEnabled: true });
    await expect(mockApi.login(email, "123456", AdminRole.ADMIN)).resolves.toMatchObject({
      user: { email, role: AdminRole.REVIEWER },
    });
    const afterLogin = await mockApi.listAccounts(email, AdminRole.REVIEWER, AdminAccountStatus.ACTIVE, 1);
    expect(afterLogin.items[0]?.lastLoginAt).toBeTruthy();

    const persisted = `${localStorage.getItem("microfocus.admin.mock-accounts-v1")} ${localStorage.getItem("microfocus.admin.mock-setup-links-v1")}`;
    expect(persisted).not.toContain("strong-password-2026");
    expect(persisted).not.toContain('"otp"');
    expect(persisted).not.toContain(setup.manualKey);
  });

  it("blocks self-management of the current system administrator", async () => {
    await expect(
      mockApi.suspendAccount("admin-1", {
        reason: "不能停用当前登录账号",
        otp: "123456",
      }),
    ).rejects.toThrow("不能停用自己的账号");
    await expect(
      mockApi.updateAccount("admin-1", {
        role: AdminRole.EDITOR,
        otp: "123456",
      }),
    ).rejects.toThrow("不能修改自己的角色");
  });

  it("requires an active replacement editor before suspending an editor with dramas", async () => {
    await expect(mockApi.suspendAccount("editor-1", {
      reason: "员工离职，移交全部剧目",
      otp: "123456",
    })).rejects.toThrow("选择另一名正常的内容编辑");

    await mockApi.suspendAccount("editor-1", {
      reason: "员工离职，移交全部剧目",
      transferEditorId: "editor-2",
      otp: "123456",
    });
    const dramas = await mockApi.listDramas("", "", 1);
    expect(dramas.items.filter((item) => item.ownerId === "editor-1")).toHaveLength(0);
  });
});
