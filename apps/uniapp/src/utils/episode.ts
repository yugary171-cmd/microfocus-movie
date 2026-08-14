import { FREE_EPISODE_COUNT } from "../constants/runtime";

export function isFreeEpisode(episodeNumber: number): boolean {
  return Number.isInteger(episodeNumber) && episodeNumber <= FREE_EPISODE_COUNT;
}

export function canStartEpisode(
  episodeNumber: number,
  currentDramaRemainingSeconds: number
): boolean {
  return isFreeEpisode(episodeNumber) || currentDramaRemainingSeconds > 0;
}
