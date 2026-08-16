import { uniqueHistoryDramaIds, type WatchHistoryItem } from "@microfocus/contracts";
import { createMockHistoryCards, type HistoryCardView } from "../utils/history-view";
import { FAVORITE_TAB, LIKE_TAB, type LibraryGridTab } from "../utils/inbox-view";

let cards = createMockHistoryCards();
let favoriteCards = createMockFavoriteCards();
let likeCards = createMockLikeCards();

function cloneCards(items: HistoryCardView[]): HistoryCardView[] {
  return items.map((item) => ({ ...item }));
}

function pickMockCards(source: HistoryCardView[], indexes: number[], prefix: string): HistoryCardView[] {
  return indexes.flatMap((index) => {
    const item = source[index];
    return item ? [{ ...item, id: `${prefix}-${item.id}` }] : [];
  });
}

function createMockFavoriteCards(now = new Date()): HistoryCardView[] {
  return pickMockCards(createMockHistoryCards(now), [3, 0, 1], "fav");
}

function createMockLikeCards(now = new Date()): HistoryCardView[] {
  return pickMockCards(createMockHistoryCards(now), [4, 2, 5], "like");
}

function deleteFromStore(store: HistoryCardView[], dramaIds: string[]): { next: HistoryCardView[]; deleted: string[] } {
  const wanted = new Set(uniqueHistoryDramaIds(dramaIds));
  const deleted: string[] = [];
  const next: HistoryCardView[] = [];
  for (const card of store) {
    const key = card.dramaId || card.id;
    if (wanted.has(key)) deleted.push(key);
    else next.push(card);
  }
  return { next, deleted };
}

export function getMockHistoryCards(): HistoryCardView[] {
  return cloneCards(cards);
}

export function getMockFavoriteCards(): HistoryCardView[] {
  return cloneCards(favoriteCards);
}

export function getMockLikeCards(): HistoryCardView[] {
  return cloneCards(likeCards);
}

export function getMockLibraryCards(tab: LibraryGridTab): HistoryCardView[] {
  if (tab === FAVORITE_TAB) return getMockFavoriteCards();
  if (tab === LIKE_TAB) return getMockLikeCards();
  return getMockHistoryCards();
}

export function resetMockHistoryCards(now = new Date()): void {
  cards = createMockHistoryCards(now);
  favoriteCards = createMockFavoriteCards(now);
  likeCards = createMockLikeCards(now);
}

export function deleteMockHistory(dramaIds: string[]): string[] {
  const result = deleteFromStore(cards, dramaIds);
  cards = result.next;
  return result.deleted;
}

export function deleteMockLibraryCards(tab: LibraryGridTab, dramaIds: string[]): string[] {
  if (tab === FAVORITE_TAB) {
    const result = deleteFromStore(favoriteCards, dramaIds);
    favoriteCards = result.next;
    return result.deleted;
  }
  if (tab === LIKE_TAB) {
    const result = deleteFromStore(likeCards, dramaIds);
    likeCards = result.next;
    return result.deleted;
  }
  return deleteMockHistory(dramaIds);
}

export function toMockWatchHistoryItems(): WatchHistoryItem[] {
  return cards.map((card) => ({
    drama: {
      id: card.dramaId || card.id,
      title: card.title,
      summary: "",
      coverUrl: "",
      category: card.tag,
      tags: card.formatSource ? card.formatSource.split(/\s+/).filter(Boolean) : [card.tag],
      episodeCount: card.episodeCount,
      recommendationRank: 0,
      licenseNumber: ""
    },
    episodeNumber: card.episodeNumber,
    mediaPositionSeconds: card.position,
    updatedAt: card.updatedAt
  }));
}
