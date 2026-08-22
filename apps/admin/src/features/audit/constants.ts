import type { AuditLog } from "@/shared/types";

export const auditResultLabels: Record<AuditLog["result"], string> = {
  SUCCESS: "成功",
  DENIED: "已拒绝",
  FAILED: "失败",
  UNKNOWN: "未返回",
};

export const auditResultTones: Record<AuditLog["result"], "neutral" | "success" | "warning" | "danger"> = {
  SUCCESS: "success",
  DENIED: "warning",
  FAILED: "danger",
  UNKNOWN: "neutral",
};
