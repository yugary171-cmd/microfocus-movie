import { SystemNotificationStatus } from "@microfocus/contracts";

export const notificationStatusLabels: Record<SystemNotificationStatus, string> = {
  [SystemNotificationStatus.DRAFT]: "草稿",
  [SystemNotificationStatus.PUBLISHED]: "已发布",
  [SystemNotificationStatus.RETRACTED]: "已撤回",
};

export const notificationActionMessages = {
  saved: "通知草稿已保存。",
  published: "通知已发布。",
  retracted: "通知已撤回。",
  deleted: "通知草稿已删除。",
  copied: "复制成功",
  copyFailed: "复制失败，请检查浏览器剪贴板权限。",
} as const;
