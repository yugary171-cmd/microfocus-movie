import type { DramaDetail } from "@microfocus/contracts";
import { playerUrlFromHistory, type HistoryCardView } from "./history-view";

export async function resolveHistoryPlayerUrl(
  item: HistoryCardView,
  getDrama: (id: string) => Promise<DramaDetail>
): Promise<string> {
  const drama = await getDrama(item.dramaId);
  const episode = drama.episodes.find((entry) => entry.episodeNumber === item.episodeNumber);
  if (!episode) throw new Error("该观看记录对应的剧集已不存在");
  return playerUrlFromHistory(item, episode.id);
}
