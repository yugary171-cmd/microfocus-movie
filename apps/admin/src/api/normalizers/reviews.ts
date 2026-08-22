
import type {
  ReviewItem
} from "@/shared/types";

import {
  record,
  text,
  dateText,
  enumValue,
  collection
} from "./primitives";

export function normalizeReviewList(value: unknown): ReviewItem[] {
  return collection(value)
    .map((item) => {
      const source = record(item);
      const editor = record(source.editor);
      const dramaId = text(source.dramaId) || text(source.id);
      return {
        id: text(source.id) || dramaId,
        dramaId,
        dramaTitle: text(source.dramaTitle) || text(source.title),
        submitterId: text(source.submitterId) || text(source.editorId) || text(editor.id),
        submitterName: text(source.submitterName) || text(editor.email),
        submittedAt: dateText(source.submittedAt) || dateText(source.updatedAt),
        riskFlags: Array.isArray(source.riskFlags)
          ? source.riskFlags.filter((flag): flag is string => typeof flag === "string")
          : ["自动风险标记未返回，请完整人工复核"],
        status: enumValue(
          source.status,
          ["PENDING", "APPROVED", "REJECTED"] as const,
          "PENDING",
        ),
      };
    })
    .filter((item) => item.dramaId.length > 0);
}
