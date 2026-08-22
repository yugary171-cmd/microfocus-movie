import { adminApi } from "@/infrastructure/api/admin";

export const notificationsApi = {
  listNotifications: adminApi.listNotifications,
  getNotification: adminApi.getNotification,
  createNotification: adminApi.createNotification,
  updateNotification: adminApi.updateNotification,
  deleteNotification: adminApi.deleteNotification,
  publishNotification: adminApi.publishNotification,
  retractNotification: adminApi.retractNotification,
} as const;
