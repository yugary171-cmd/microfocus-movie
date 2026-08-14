import type { WatchHistoryItem } from "@microfocus/contracts";
import { formatPosition } from "./format";

export type HistoryCardView = {
  id: string;
  title: string;
  episode: string;
  tag: string;
  tone: "rose" | "blue" | "ink" | "gold" | "wine" | "night";
  dramaId: string;
  episodeNumber: number;
  position: number;
};

const TONES: HistoryCardView["tone"][] = ["rose", "blue", "ink", "gold", "wine", "night"];

export function toHistoryCardViews(history: WatchHistoryItem[]): HistoryCardView[] {
  return history.map((item, index) => ({
    id: `${item.drama.id}-${item.episodeNumber}`,
    title: item.drama.title,
    episode: `第 ${item.episodeNumber} 集 · ${formatPosition(item.mediaPositionSeconds)}`,
    tag: item.drama.category || "短剧",
    tone: TONES[index % TONES.length] || "rose",
    dramaId: item.drama.id,
    episodeNumber: item.episodeNumber,
    position: Math.max(0, item.mediaPositionSeconds)
  }));
}

export function playerUrlFromHistory(
  item: HistoryCardView,
  episodeId: string
): string {
  return `/pages/player/index?dramaId=${encodeURIComponent(item.dramaId)}&episodeId=${encodeURIComponent(episodeId)}&title=${encodeURIComponent(item.title)}&episodeNumber=${item.episodeNumber}&position=${item.position}`;
}
