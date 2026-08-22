
import type {
  AdminNotificationRecord,
  PageResult
} from "@/shared/types";

import {
  record,
  text,
  finiteNumber,
  dateText,
  enumValue,
  collection
} from "./primitives";

export function normalizeAdminNotificationList(value: unknown): PageResult<AdminNotificationRecord> {
  const source = record(value);
  const items = collection(value).map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      title: text(row.title),
      body: text(row.body),
      status: enumValue(row.status, ["DRAFT", "PUBLISHED", "RETRACTED"] as const, "DRAFT"),
      publishedAt: dateText(row.publishedAt) || null,
      createdAt: dateText(row.createdAt),
      createdByAdminId: text(row.createdByAdminId),
      createdByAdminName: text(row.createdByAdminName) || "未知管理员",
    } as AdminNotificationRecord;
  }).filter((item) => item.id.length > 0);
  return { items, total: finiteNumber(source.total) || items.length };
}
