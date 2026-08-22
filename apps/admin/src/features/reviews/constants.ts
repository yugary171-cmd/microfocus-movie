export const reviewStatusLabels = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
} as const;

export const reviewStatusTones = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
} as const;

export const reviewActionMessages = {
  mockCompleted: "演示审核结论已记在本机浏览器中；刷新后已退回的剧不会再进待审队列。未提交真实内容平台。",
  completed: "审核结论已提交。",
} as const;
