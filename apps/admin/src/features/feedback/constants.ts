import { UserFeedbackStatus } from "@microfocus/contracts";

export const feedbackStatusLabels: Record<UserFeedbackStatus, string> = {
  [UserFeedbackStatus.NEW]: "待处理",
  [UserFeedbackStatus.PROCESSING]: "处理中",
  [UserFeedbackStatus.RESOLVED]: "已解决",
};
