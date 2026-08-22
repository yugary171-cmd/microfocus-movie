import { adminApi } from "@/infrastructure/api/admin";

export const feedbackApi = {
  listFeedback: adminApi.listFeedback,
  getFeedback: adminApi.getFeedback,
  updateFeedback: adminApi.updateFeedback,
  replyFeedback: adminApi.replyFeedback,
} as const;
