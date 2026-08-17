import type { DramaCard } from "@microfocus/contracts";

export const DISCOVER_FILTER_SECTIONS = [
  { key: "format", all: "全部体裁", options: ["全部体裁", "真人剧", "漫剧", "AI 剧"], collapsible: false },
  { key: "subject", all: "全部主题", options: ["全部主题", "现言", "女性成长", "脑洞", "奇幻", "玄幻", "古言", "战神", "宫斗"], collapsible: false },
  { key: "setting", all: "全部设定", options: ["全部设定", "打脸虐渣", "大男主", "大女主", "马甲", "重生", "穿越"], collapsible: false },
  { key: "background", all: "全部背景", options: ["全部背景", "现代", "都市", "古代", "乡村", "年代", "架空", "职场"], collapsible: false },
  { key: "recommendation", all: "全部推荐", options: ["全部推荐", "最新上架", "最高热度", "最高收藏"], collapsible: true },
  { key: "audience", all: "全部受众", options: ["全部受众", "男频", "女频"], collapsible: true },
  { key: "time", all: "全部时间", options: ["全部时间", "7天内上新", "14天内上新", "30天内上新", "90天内上新"], collapsible: true }
] as const;

export type DiscoverFilterKey = (typeof DISCOVER_FILTER_SECTIONS)[number]["key"];

export const DEFAULT_DISCOVER_FILTERS: Record<DiscoverFilterKey, string> = {
  format: "全部体裁",
  subject: "全部主题",
  setting: "全部设定",
  background: "全部背景",
  recommendation: "全部推荐",
  audience: "全部受众",
  time: "全部时间"
};

export const RANKING_TABS = ["全部", "真人剧", "漫剧", "AI 剧"] as const;
export const RANKING_TYPES = ["推荐榜", "热播榜", "热搜榜", "收藏榜"] as const;

export function visibleDiscoverSections(expanded: boolean) {
  return DISCOVER_FILTER_SECTIONS
    .filter((section) => expanded || !section.collapsible)
    .map((section) => ({ ...section, choices: section.options.slice(1) }));
}

export function rankingHeatLabel(rank: number | undefined): string {
  const value = Math.max(1, Number(rank) || 0) * 10;
  return `${value}万`;
}

export function sortDiscoverItems(
  items: readonly DramaCard[],
  recommendation: string
): DramaCard[] {
  const next = items.slice();
  if (recommendation === "最高热度" || recommendation === "最高收藏" || recommendation === "最新上架") {
    next.sort((left, right) => (right.recommendationRank || 0) - (left.recommendationRank || 0));
  }
  return next;
}

export function sortRankingItems(items: readonly DramaCard[], type: string): DramaCard[] {
  const next = items.slice();
  if (type === "热播榜") {
    next.sort((left, right) => (right.episodeCount || 0) - (left.episodeCount || 0));
    return next;
  }
  next.sort((left, right) => (right.recommendationRank || 0) - (left.recommendationRank || 0));
  return next;
}

export function rankingUpdatedCopy(now = new Date()): string {
  return `${now.getMonth() + 1}月${now.getDate()}日已更新 · 基于观看与互动排序`;
}
