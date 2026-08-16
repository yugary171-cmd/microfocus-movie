import type { HistoryCardView } from "./history-view";
import { boundListQuery } from "@microfocus/contracts";

export const HISTORY_COMPLETION_FILTERS = ["全部", "已看完", "未看完"] as const;
export type HistoryCompletionFilter = (typeof HISTORY_COMPLETION_FILTERS)[number];

export type HistoryFormatId = "all" | "live" | "comic" | "ai";
export type HistoryDurationId = "all" | "gt5s" | "gt1m" | "gt5m" | "gt15m" | "gt30m";
export type HistoryTimeId = "all" | "today" | "yesterday" | "month" | "quarter" | "earlier";

export type HistorySheetFilter = {
  format: HistoryFormatId;
  duration: HistoryDurationId;
  time: HistoryTimeId;
};

export const DEFAULT_HISTORY_SHEET_FILTER: HistorySheetFilter = {
  format: "all",
  duration: "all",
  time: "all"
};

export const HISTORY_FORMAT_OPTIONS: Array<{ id: HistoryFormatId; label: string }> = [
  { id: "all", label: "全部" },
  { id: "live", label: "真人剧" },
  { id: "comic", label: "漫剧" },
  { id: "ai", label: "AI 剧" }
];

export const HISTORY_DURATION_OPTIONS: Array<{ id: HistoryDurationId; label: string; minSeconds: number }> = [
  { id: "all", label: "全部", minSeconds: 0 },
  { id: "gt5s", label: "超5秒钟", minSeconds: 5 },
  { id: "gt1m", label: "超1分钟", minSeconds: 60 },
  { id: "gt5m", label: "超5分钟", minSeconds: 300 },
  { id: "gt15m", label: "超15分钟", minSeconds: 900 },
  { id: "gt30m", label: "超30分钟", minSeconds: 1800 }
];

export const HISTORY_TIME_OPTIONS: Array<{ id: HistoryTimeId; label: string }> = [
  { id: "all", label: "全部" },
  { id: "today", label: "今天" },
  { id: "yesterday", label: "昨天" },
  { id: "month", label: "一个月内" },
  { id: "quarter", label: "三个月内" },
  { id: "earlier", label: "更早" }
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function cloneHistorySheetFilter(filter: HistorySheetFilter = DEFAULT_HISTORY_SHEET_FILTER): HistorySheetFilter {
  return { format: filter.format, duration: filter.duration, time: filter.time };
}

export function isDefaultHistorySheetFilter(filter: HistorySheetFilter): boolean {
  return filter.format === "all" && filter.duration === "all" && filter.time === "all";
}

export function inferHistoryFormat(source: string): Exclude<HistoryFormatId, "all"> | "other" {
  const text = source.trim();
  if (!text) return "other";
  if (text.includes("AI")) return "ai";
  if (text.includes("漫")) return "comic";
  if (text.includes("真人")) return "live";
  return "other";
}

export function isHistoryCompletionFilter(value: string): value is HistoryCompletionFilter {
  return (HISTORY_COMPLETION_FILTERS as readonly string[]).includes(value);
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function matchesCompletion(item: HistoryCardView, completion: HistoryCompletionFilter): boolean {
  if (completion === "全部") return true;
  const finished = item.episodeCount > 0 && item.episodeNumber >= item.episodeCount;
  return completion === "已看完" ? finished : !finished;
}

function matchesFormat(item: HistoryCardView, format: HistoryFormatId): boolean {
  if (format === "all") return true;
  return inferHistoryFormat(item.formatSource || item.tag) === format;
}

function matchesDuration(item: HistoryCardView, duration: HistoryDurationId): boolean {
  const option = HISTORY_DURATION_OPTIONS.find((entry) => entry.id === duration);
  if (!option || option.id === "all") return true;
  return item.position > option.minSeconds;
}

function matchesTime(item: HistoryCardView, time: HistoryTimeId, now: Date): boolean {
  if (time === "all") return true;
  const updated = Date.parse(item.updatedAt);
  if (!Number.isFinite(updated)) return false;
  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  if (time === "today") return updated >= todayStart;
  if (time === "yesterday") return updated >= yesterdayStart && updated < todayStart;
  if (time === "month") return updated >= now.getTime() - 30 * DAY_MS;
  if (time === "quarter") return updated >= now.getTime() - 90 * DAY_MS;
  return updated < now.getTime() - 90 * DAY_MS;
}

function matchesQuery(item: HistoryCardView, query: string): boolean {
  const keyword = boundListQuery(query).toLowerCase();
  if (!keyword) return true;
  return (item.title || "").toLowerCase().includes(keyword);
}

export function filterHistoryItems(
  items: readonly HistoryCardView[],
  input: {
    completion?: HistoryCompletionFilter;
    sheet?: HistorySheetFilter;
    query?: string;
    now?: Date;
  } = {}
): HistoryCardView[] {
  const completion = input.completion && isHistoryCompletionFilter(input.completion) ? input.completion : "全部";
  const sheet = input.sheet ?? DEFAULT_HISTORY_SHEET_FILTER;
  const now = input.now ?? new Date();
  return items.filter(
    (item) =>
      matchesCompletion(item, completion) &&
      matchesFormat(item, sheet.format) &&
      matchesDuration(item, sheet.duration) &&
      matchesTime(item, sheet.time, now) &&
      matchesQuery(item, input.query || "")
  );
}
