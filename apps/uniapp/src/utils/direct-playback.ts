import type { DramaDetail, EpisodeSummary, WatchHistoryItem } from "@microfocus/contracts";
import { getApi, getStoredSession, isMockMode } from "../services/api";
import { playerUrlFromEpisode } from "./player-navigation";

export function chooseResumeEpisode(
  drama: DramaDetail,
  history: WatchHistoryItem[] | undefined
): { episode: EpisodeSummary; position: number } {
  const firstEpisode = Array.isArray(drama.episodes) ? drama.episodes[0] : undefined;
  if (!firstEpisode) throw new Error("该短剧暂时没有可播放剧集");
  const record = Array.isArray(history)
    ? history.find((item) => item?.drama?.id === drama.id)
    : undefined;
  const episode = record
    ? drama.episodes.find((item) => item.episodeNumber === record.episodeNumber)
    : undefined;
  return {
    episode: episode || firstEpisode,
    position: episode ? Math.max(0, Number(record?.mediaPositionSeconds) || 0) : 0
  };
}

/** Resolve a drama-card tap to the most relevant playable episode. */
export async function resolveDirectPlaybackUrl(dramaId: string): Promise<string> {
  const id = String(dramaId || "").trim();
  if (!id) throw new Error("缺少短剧编号");

  const api = getApi();
  const drama = await api.getDrama(id);
  let history: WatchHistoryItem[] | undefined;
  if (isMockMode() || getStoredSession()) {
    try {
      history = await api.getHistory();
    } catch {
      // History is an enhancement; a card tap must still reach episode one.
    }
  }

  const { episode, position } = chooseResumeEpisode(drama as DramaDetail, history);
  return playerUrlFromEpisode(drama as DramaDetail, episode, position);
}
