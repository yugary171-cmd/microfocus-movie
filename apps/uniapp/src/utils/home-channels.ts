import type { DramaCard } from "@microfocus/contracts";
import {
  HOME_DRAMA_CHANNELS,
  HOME_EXCLUDED_CHANNELS,
  HOME_RECOMMEND_CHANNEL
} from "../constants/runtime";

const EXCLUDED = new Set<string>(HOME_EXCLUDED_CHANNELS);

export function isRecommendChannel(name: string): boolean {
  return name === HOME_RECOMMEND_CHANNEL || name === "全部" || name === "";
}

export function matchesHomeChannel(card: DramaCard, channel: string): boolean {
  if (isRecommendChannel(channel)) return true;
  return card.category === channel || (Array.isArray(card.tags) && card.tags.includes(channel));
}

export function buildHomeChannels(fromApi: readonly string[] | null | undefined): string[] {
  const extras = (Array.isArray(fromApi) ? fromApi : [])
    .map((name) => name.trim())
    .filter(
      (name) =>
        name &&
        name !== HOME_RECOMMEND_CHANNEL &&
        name !== "全部" &&
        !EXCLUDED.has(name) &&
        !(HOME_DRAMA_CHANNELS as readonly string[]).includes(name)
    );
  return [HOME_RECOMMEND_CHANNEL, ...HOME_DRAMA_CHANNELS, ...extras];
}

export function searchCategoryParam(channel: string): string {
  return isRecommendChannel(channel) ? "" : channel;
}
