import {
  HISTORY_LIST_LIMIT,
  SOCIAL_LIST_MAX_PAGE,
  SOCIAL_LIST_PAGE_SIZE,
  type DramaLibraryItem,
  type SocialPage
} from "@microfocus/contracts";
import { getApi } from "./api";
import { FAVORITE_TAB, LIKE_TAB, type LibraryGridTab } from "../utils/inbox-view";
import { toLibraryCardViews, type HistoryCardView } from "../utils/history-view";

const LIBRARY_MAX_PAGES = Math.min(
  SOCIAL_LIST_MAX_PAGE,
  Math.max(1, Math.ceil(HISTORY_LIST_LIMIT / SOCIAL_LIST_PAGE_SIZE))
);

export async function collectSocialPages<T>(
  fetchPage: (page: number) => Promise<SocialPage<T>>,
  maxPages = LIBRARY_MAX_PAGES
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page);
    const batch = Array.isArray(result?.items) ? result.items : [];
    items.push(...batch);
    if (!result?.hasMore || !batch.length) break;
  }
  return items;
}

export async function loadFavoriteCards(): Promise<HistoryCardView[]> {
  const items = await collectSocialPages((page) => getApi().social.getFavorites(page));
  return toLibraryCardViews(items);
}

export async function loadLikedDramaCards(): Promise<HistoryCardView[]> {
  const items = await collectSocialPages((page) => getApi().social.getLikedDramas(page));
  return toLibraryCardViews(items);
}

export async function removeLibraryItems(tab: LibraryGridTab, dramaIds: string[]): Promise<void> {
  const social = getApi().social;
  await Promise.all(
    dramaIds.map((dramaId) =>
      tab === LIKE_TAB ? social.deleteLikedDrama(dramaId) : social.deleteFavorite(dramaId)
    )
  );
}

export async function setDramaLibraryFlag(
  tab: typeof FAVORITE_TAB | typeof LIKE_TAB,
  dramaId: string,
  enabled: boolean
): Promise<void> {
  const social = getApi().social;
  if (tab === FAVORITE_TAB) {
    await (enabled ? social.putFavorite(dramaId) : social.deleteFavorite(dramaId));
    return;
  }
  await (enabled ? social.putLikedDrama(dramaId) : social.deleteLikedDrama(dramaId));
}

export async function dramaInLibraryPages(
  fetchPage: (page: number) => Promise<SocialPage<DramaLibraryItem>>,
  dramaId: string
): Promise<boolean> {
  const items = await collectSocialPages(fetchPage);
  return items.some((item) => item.drama.id === dramaId);
}
