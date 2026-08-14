import type { DramaDetail, EpisodeSummary } from "@microfocus/contracts";

export function playerUrlFromEpisode(drama: DramaDetail, episode: EpisodeSummary): string {
  return `/pages/player/index?dramaId=${encodeURIComponent(drama.id)}&episodeId=${encodeURIComponent(episode.id)}&title=${encodeURIComponent(drama.title)}&episodeNumber=${episode.episodeNumber}`;
}
