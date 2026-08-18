export type EpisodeFeedItem = { id: string };

export function getAdjacentEpisode<T extends EpisodeFeedItem>(
  episodes: readonly T[],
  currentEpisodeId: string,
  direction: -1 | 1
): T | undefined {
  const currentIndex = episodes.findIndex((episode) => episode.id === currentEpisodeId);
  if (currentIndex < 0) return undefined;
  return episodes[currentIndex + direction];
}
