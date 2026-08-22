import {
  AdminRole,
  type AdminAuditContext
} from "@microfocus/contracts";
import type {
  AuditLog
} from "@/shared/types";

import {
  record,
  text,
  dateText,
  enumValue,
  collection
} from "./primitives";

export function normalizeAuditList(value: unknown): AuditLog[] {
  return collection(value)
    .map((item) => {
      const source = record(item);
      const context = normalizeAuditContext(source.context);
      return {
        id: text(source.id),
        createdAt: dateText(source.createdAt),
        actorName: text(source.actorName) || text(source.adminId),
        actorRole:
          typeof source.actorRole === "string" &&
          Object.values(AdminRole).includes(source.actorRole as AdminRole)
            ? (source.actorRole as AdminRole)
            : null,
        action: text(source.action),
        target:
          text(source.target) ||
          [text(source.targetType), text(source.targetId)].filter(Boolean).join(" · "),
        result: enumValue(
          source.result,
          ["SUCCESS", "DENIED", "FAILED", "UNKNOWN"] as const,
          "UNKNOWN",
        ),
        requestId: text(source.requestId),
        detail: text(source.detail),
        ...(context ? { context } : {}),
      };
    })
    .filter((item) => item.id.length > 0);
}

export function normalizeAuditContext(value: unknown): AdminAuditContext | undefined {
  const source = record(value);
  const context: AdminAuditContext = {};
  const stringKeys = [
    "dramaId", "episodeId", "mediaAssetId", "fileId", "fileName", "fromStatus", "toStatus",
    "reviewStatus", "manualReviewStatus", "wechatReviewStatus", "fromManualReviewStatus",
    "toManualReviewStatus", "fromWechatReviewStatus", "toWechatReviewStatus", "uploadPhase"
  ] as const;
  for (const key of stringKeys) {
    if (typeof source[key] === "string") Object.assign(context, { [key]: source[key] });
  }
  const numberKeys = ["episodeNumber", "mediaVersion", "contentVersion"] as const;
  for (const key of numberKeys) {
    if (typeof source[key] === "number" && Number.isFinite(source[key])) Object.assign(context, { [key]: source[key] });
  }
  return Object.keys(context).length ? context : undefined;
}
