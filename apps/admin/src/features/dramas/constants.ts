import { DramaStatus } from "@microfocus/contracts";

export const dramaStatusTones: Record<DramaStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  [DramaStatus.DRAFT]: "neutral",
  [DramaStatus.UPLOADING]: "info",
  [DramaStatus.PROCESSING]: "info",
  [DramaStatus.PENDING_REVIEW]: "warning",
  [DramaStatus.PENDING_WECHAT]: "warning",
  [DramaStatus.READY]: "success",
  [DramaStatus.PUBLISHED]: "success",
  [DramaStatus.OFFLINE]: "danger",
  [DramaStatus.ARCHIVED]: "neutral",
};

export const dramaActionMessages = {
  coverUploaded: "剧目海报已上传。",
  promoCoverUploaded: "推广海报已上传。",
  mockSaved: "已保存到当前演示会话；刷新页面后可能重置。",
  saved: "剧目已保存。",
  mockReviewSubmitted: "已进入演示审核队列，未提交真实审核。",
  reviewSubmitted: "已提交审核。",
  mockPublished: "演示状态已更新为已发布；未触发真实发布。",
  published: "剧目已发布。",
  mockOffline: "演示状态已更新为已下架；未触发真实下架。",
  offline: "剧目已下架。",
} as const;
