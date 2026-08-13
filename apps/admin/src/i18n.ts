import { AdminRole, DramaStatus, MediaStatus } from "@microfocus/contracts";

export const roleLabels: Record<AdminRole, string> = {
  [AdminRole.EDITOR]: "内容编辑",
  [AdminRole.REVIEWER]: "内容审核",
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

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
