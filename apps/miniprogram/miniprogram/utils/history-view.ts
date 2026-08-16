import type { WatchHistoryItem } from "@microfocus/contracts";
import { formatPosition } from "./format";

export type HistoryCardView = {
  id: string;
  title: string;
  episode: string;
  tag: string;
  formatSource: string;
  tone: "rose" | "blue" | "ink" | "gold" | "wine" | "night";
  dramaId: string;
  episodeNumber: number;
  episodeCount: number;
  position: number;
  updatedAt: string;
};

const TONES: HistoryCardView["tone"][] = ["rose", "blue", "ink", "gold", "wine", "night"];

function daysAgoIso(now: Date, days: number, hour = 15): string {
  const date = new Date(now);
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function createMockHistoryCards(now = new Date()): HistoryCardView[] {
  return [
    {
      id: "history-1",
      title: "引她入室",
      episode: "1 集 / 58 集",
      tag: "真人剧",
      formatSource: "真人剧",
      tone: "rose",
      dramaId: "history-1",
      episodeNumber: 1,
      episodeCount: 58,
      position: 72,
      updatedAt: daysAgoIso(now, 0)
    },
    {
      id: "history-2",
      title: "凤栖今朝",
      episode: "1 集 / 71 集",
      tag: "真人剧",
      formatSource: "真人剧",
      tone: "blue",
      dramaId: "history-2",
      episodeNumber: 1,
      episodeCount: 71,
      position: 8,
      updatedAt: daysAgoIso(now, 1)
    },
    {
      id: "history-3",
      title: "春色撩撩",
      episode: "1 集 / 105 集",
      tag: "漫剧",
      formatSource: "漫画 漫剧",
      tone: "ink",
      dramaId: "history-3",
      episodeNumber: 1,
      episodeCount: 105,
      position: 400,
      updatedAt: daysAgoIso(now, 40)
    },
    {
      id: "history-4",
      title: "皇后娘娘来打工",
      episode: "80 集 / 80 集",
      tag: "真人剧",
      formatSource: "真人剧",
      tone: "gold",
      dramaId: "history-4",
      episodeNumber: 80,
      episodeCount: 80,
      position: 2100,
      updatedAt: daysAgoIso(now, 120)
    },
    {
      id: "history-5",
      title: "请君入我怀",
      episode: "1 集 / 60 集",
      tag: "AI 剧",
      formatSource: "AI 剧",
      tone: "wine",
      dramaId: "history-5",
      episodeNumber: 1,
      episodeCount: 60,
      position: 40,
      updatedAt: daysAgoIso(now, 0)
    },
    {
      id: "history-6",
      title: "苏太太高调离婚了",
      episode: "1 集 / 52 集",
      tag: "真人剧",
      formatSource: "真人剧",
      tone: "night",
      dramaId: "history-6",
      episodeNumber: 1,
      episodeCount: 52,
      position: 3,
      updatedAt: daysAgoIso(now, 0)
    }
  ];
}

export function toHistoryCardViews(history: WatchHistoryItem[]): HistoryCardView[] {
  return history.map((item, index) => {
    const tags = Array.isArray(item.drama.tags) ? item.drama.tags : [];
    const formatSource = [item.drama.category, ...tags].filter(Boolean).join(" ");
    return {
      id: `${item.drama.id}-${item.episodeNumber}`,
      title: item.drama.title,
      episode: `第 ${item.episodeNumber} 集 · ${formatPosition(item.mediaPositionSeconds)}`,
      tag: item.drama.category || "短剧",
      formatSource,
      tone: TONES[index % TONES.length] || "rose",
      dramaId: item.drama.id,
      episodeNumber: item.episodeNumber,
      episodeCount: Math.max(0, item.drama.episodeCount || 0),
      position: Math.max(0, item.mediaPositionSeconds),
      updatedAt: item.updatedAt || ""
    };
  });
}

export function playerUrlFromHistory(
  item: HistoryCardView,
  episodeId: string
): string {
  return `/pages/player/index?dramaId=${encodeURIComponent(item.dramaId)}&episodeId=${encodeURIComponent(episodeId)}&title=${encodeURIComponent(item.title)}&episodeNumber=${item.episodeNumber}&position=${item.position}`;
}
