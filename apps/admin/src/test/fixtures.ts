import { AdminRole, DramaStatus, MediaStatus, RIGHTS_MATERIAL_DIGEST_LENGTH, type ReleaseGateStatus } from "@microfocus/contracts";
import type { AdminUser, DramaRecord } from "@/types/admin";

export function createUser(role: AdminRole, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: `${role.toLowerCase()}-1`,
    name: "测试用户",
    email: "test@example.com",
    role,
    ...overrides,
  };
}

export function createGate(overrides: Partial<ReleaseGateStatus> = {}): ReleaseGateStatus {
  return {
    entityApproved: true,
    miniProgramFilingApproved: true,
    wechatCategoryApproved: true,
    adsApproved: true,
    readyForExternalTraffic: true,
    blockers: [],
    ...overrides,
  };
}

export function createDrama(overrides: Partial<DramaRecord> = {}): DramaRecord {
  return {
    id: "drama-test",
    title: "测试剧目",
    summary: "用于验证管理台行为",
    category: "测试",
    tags: [],
    coverUrl: "",
    status: DramaStatus.READY,
    ownerId: "editor-1",
    ownerName: "内容编辑",
    rightsHolder: "测试权利方",
    licenseNumber: "TEST-001",
    rightsValidFrom: "2026-01-01",
    licenseExpiresAt: "2028-01-01",
    rightsReportNumber: "REPORT-001",
    rightsMaterialObjectKey: "rights/test/license.pdf",
    rightsMaterialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH),
    allowsWechatDistribution: true,
    allowsAdMonetization: true,
    allowsTranscoding: true,
    allowsPromotionalMaterial: true,
    contentApproved: true,
    copyrightVerified: true,
    wechatApproved: true,
    episodes: [
      {
        id: "episode-test",
        episodeNumber: 1,
        title: "第一集",
        durationSeconds: 120,
        mediaStatus: MediaStatus.READY,
        transcodeStatus: "READY",
        machineReviewStatus: "APPROVED",
        manualReviewStatus: "APPROVED",
        wechatReviewStatus: "APPROVED",
        updatedAt: "2026-08-12T00:00:00.000Z",
      },
    ],
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides,
  };
}
