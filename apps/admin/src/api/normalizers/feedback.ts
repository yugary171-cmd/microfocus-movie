
import type {
  AdminFeedbackRecord,
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

export function normalizeAdminFeedbackList(value: unknown): PageResult<AdminFeedbackRecord> {
  const source = record(value);
  const items = collection(value).map((item) => {
    const row = record(item);
    return {
      id: text(row.id),
      body: text(row.body),
      status: enumValue(row.status, ["NEW", "PROCESSING", "RESOLVED"] as const, "NEW"),
      internalNote: typeof row.internalNote === "string" ? row.internalNote : null,
      createdAt: dateText(row.createdAt),
      updatedAt: dateText(row.updatedAt),
      replies: Array.isArray(row.replies) ? row.replies.map((reply) => {
        const item = record(reply);
        return { id: text(item.id), body: text(item.body), createdAt: dateText(item.createdAt) };
      }) : [],
      userId: text(row.userId),
      userName: text(row.userName),
      ...(text(row.userEmail) ? { userEmail: text(row.userEmail) } : {}),
      handledByAdminId: text(row.handledByAdminId) || null,
    } as AdminFeedbackRecord;
  }).filter((item) => item.id.length > 0);
  return { items, total: finiteNumber(source.total) || items.length };
}
