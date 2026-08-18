import type { DramaDetail, EpisodeSummary } from "@microfocus/contracts";

export function playerUrlFromEpisode(
  drama: DramaDetail,
  episode: EpisodeSummary,
  position = 0
): string {
  const positionQuery = Number.isFinite(position) && position > 0 ? `&position=${position}` : "";
  return `/pages/player/index?dramaId=${encodeURIComponent(drama.id)}&episodeId=${encodeURIComponent(episode.id)}&title=${encodeURIComponent(drama.title)}&episodeNumber=${episode.episodeNumber}${positionQuery}`;
}
