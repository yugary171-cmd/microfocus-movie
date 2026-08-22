import { AdminRole, DramaStatus, MediaStatus } from "@microfocus/contracts";

export const roleLabels: Record<AdminRole, string> = {
  [AdminRole.EDITOR]: "内容编辑",
  [AdminRole.REVIEWER]: "内容编辑（旧审核账号）",
  [AdminRole.ADMIN]: "系统管理员",
};

export const dramaStatusLabels: Record<DramaStatus, string> = {
  [DramaStatus.DRAFT]: "草稿",
  [DramaStatus.UPLOADING]: "上传中",
  [DramaStatus.PROCESSING]: "处理中",
  [DramaStatus.PENDING_REVIEW]: "待审核",
  [DramaStatus.PENDING_WECHAT]: "待微信审核",
  [DramaStatus.READY]: "可发布",
  [DramaStatus.PUBLISHED]: "已发布",
  [DramaStatus.OFFLINE]: "已下架",
  [DramaStatus.ARCHIVED]: "已归档",
};

export const mediaStatusLabels: Record<MediaStatus, string> = {
  [MediaStatus.CREATED]: "待上传",
  [MediaStatus.UPLOADING]: "上传中",
  [MediaStatus.PROCESSING]: "转码中",
  [MediaStatus.REVIEW_REJECTED]: "审核拒绝",
  [MediaStatus.PENDING_MANUAL_REVIEW]: "待人工审核",
  [MediaStatus.PENDING_WECHAT]: "待微信审核",
  [MediaStatus.READY]: "媒体就绪",
  [MediaStatus.FAILED]: "处理失败",
};
