import { DramaStatus, isContentOperator, isOwnedContentRole, isRightsMaterialDigest, MediaStatus, type ReleaseGateStatus } from "@microfocus/contracts";
import type { AdminUser, DramaRecord, ReviewItem } from "@/shared/types";

export interface ActionDecision {
  allowed: boolean;
  reason: string;
}

function parseRightsDate(value: string, endOfDay: boolean): number {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
    : value;
  return Date.parse(normalized);
}

export function isRightsActive(validFrom: string, expiresAt: string, now = Date.now()): boolean {
  const start = parseRightsDate(validFrom, false);
  const end = parseRightsDate(expiresAt, true);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now <= end;
}

export function canReview(user: AdminUser, item: ReviewItem): ActionDecision {
  if (!isContentOperator(user.role)) return { allowed: false, reason: "当前角色不能审核" };
  if (item.status !== "PENDING") return { allowed: false, reason: "该任务已经处理" };
  if (isOwnedContentRole(user.role) && item.submitterId !== user.id) {
    return { allowed: false, reason: "只能审核本人负责的剧目" };
  }
  return { allowed: true, reason: "" };
}

export function publishDecision(
  user: AdminUser,
  drama: DramaRecord,
  gate: ReleaseGateStatus,
  options: { allowMockInternal?: boolean } = {},
): ActionDecision {
  if (!isContentOperator(user.role)) {
    return { allowed: false, reason: "当前角色不能发布" };
  }
  if (!gate.readyForExternalTraffic && !options.allowMockInternal) {
    return { allowed: false, reason: "合规发布闸门尚未通过" };
  }
  if (drama.status !== DramaStatus.READY) {
    return { allowed: false, reason: "剧目尚未达到可发布状态" };
  }
  if (!drama.contentApproved || !drama.copyrightVerified || !drama.wechatApproved) {
    return { allowed: false, reason: "内容、版权或微信审核尚未全部通过" };
  }
  if (!isRightsActive(drama.rightsValidFrom, drama.licenseExpiresAt)) {
    return { allowed: false, reason: "版权许可当前不在有效期内" };
  }
  if (drama.episodes.length === 0) {
    return { allowed: false, reason: "至少需要一集内容" };
  }
  if (
    drama.episodes.some(
      (episode) =>
        episode.mediaStatus !== MediaStatus.READY ||
        episode.transcodeStatus !== "READY" ||
        episode.machineReviewStatus !== "APPROVED" ||
        episode.manualReviewStatus !== "APPROVED" ||
        episode.wechatReviewStatus !== "APPROVED",
    )
  ) {
    return { allowed: false, reason: "仍有剧集媒体、转码或审核状态未就绪" };
  }
  return { allowed: true, reason: "" };
}

export function canSubmitReview(user: AdminUser, drama: DramaRecord): ActionDecision {
  if (!isContentOperator(user.role)) return { allowed: false, reason: "当前角色不能提交审核" };
  if (isOwnedContentRole(user.role) && drama.ownerId !== user.id) {
    return { allowed: false, reason: "只能提交本人负责的剧目" };
  }
  if (![DramaStatus.DRAFT, DramaStatus.OFFLINE].includes(drama.status)) {
    return { allowed: false, reason: "当前状态不能重复提交" };
  }
  if (
    !drama.title.trim() ||
    !drama.rightsHolder.trim() ||
    !drama.licenseNumber.trim() ||
    !drama.rightsValidFrom ||
    !drama.licenseExpiresAt ||
    !isRightsActive(drama.rightsValidFrom, drama.licenseExpiresAt) ||
    !drama.rightsReportNumber.trim() ||
    !drama.rightsMaterialObjectKey.trim() ||
    !isRightsMaterialDigest(drama.rightsMaterialDigestSha256) ||
    !drama.allowsWechatDistribution ||
    !drama.allowsAdMonetization ||
    !drama.allowsTranscoding ||
    !drama.allowsPromotionalMaterial
  ) {
    return { allowed: false, reason: "请先补齐版权材料、摘要与全部授权范围" };
  }
  if (drama.episodes.length === 0) return { allowed: false, reason: "请至少添加一集" };
  if (
    drama.episodes.some(
      (episode) =>
        episode.mediaStatus !== MediaStatus.READY ||
        episode.transcodeStatus !== "READY" ||
        episode.machineReviewStatus !== "APPROVED" ||
        episode.manualReviewStatus !== "APPROVED" ||
        episode.wechatReviewStatus !== "APPROVED",
    )
  ) {
    return { allowed: false, reason: "请先完成每集的 Mock 处理与审核" };
  }
  return { allowed: true, reason: "" };
}

export function canOffline(user: AdminUser, drama: DramaRecord): ActionDecision {
  if (!isContentOperator(user.role)) return { allowed: false, reason: "当前角色不能下架" };
  if (drama.status !== DramaStatus.PUBLISHED) return { allowed: false, reason: "只有已发布剧目可以下架" };
  return { allowed: true, reason: "" };
}
