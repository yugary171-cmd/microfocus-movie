import {
  CatalogTagStatus,
  isCatalogTagGroupId,
  type CatalogTag
} from "@microfocus/contracts";
import type {
  DramaRecord,
  ReviewItem
} from "@/shared/types";
import type {
  MockState
} from "./state";
import {
  backfillDramaTagIds
} from "./helpers";

export const MOCK_ACCOUNTS_KEY = "microfocus.admin.mock-accounts-v1";
export const MOCK_SETUP_LINKS_KEY = "microfocus.admin.mock-setup-links-v1";
export const MOCK_CONTENT_KEY = "microfocus.admin.mock-content-v1";
export const MOCK_TAGS_KEY = "microfocus.admin.mock-tags-v1";

export function readStoredList<T>(key: string, fallback: T[]): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) && value.length > 0 ? value as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function persistAdminAccounts(state: MockState): void {
  window.localStorage.setItem(MOCK_ACCOUNTS_KEY, JSON.stringify(state.adminAccounts));
}

export function persistSetupLinks(state: MockState): void {
  window.localStorage.setItem(MOCK_SETUP_LINKS_KEY, JSON.stringify(state.mockSetupLinks));
}

export function persistMockTags(state: MockState): void {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  window.localStorage.setItem(MOCK_TAGS_KEY, JSON.stringify(state.catalogTags));
}

export function persistMockContent(state: MockState): void {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  window.localStorage.setItem(MOCK_CONTENT_KEY, JSON.stringify({ dramas: state.dramas, reviews: state.reviews }));
}

export function restoreMockTags(state: MockState, fallback: CatalogTag[]): void {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  try {
    const raw = window.localStorage.getItem(MOCK_TAGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    state.catalogTags = parsed.filter((item): item is CatalogTag => {
      if (!item || typeof item !== "object") return false;
      const row = item as CatalogTag;
      return (
        typeof row.id === "string" &&
        isCatalogTagGroupId(row.group) &&
        typeof row.name === "string" &&
        (row.status === CatalogTagStatus.ACTIVE || row.status === CatalogTagStatus.ARCHIVED)
      );
    });
    if (state.catalogTags.length === 0) state.catalogTags = fallback;
  } catch {
    state.catalogTags = fallback;
  }
}

export function restoreMockContent(state: MockState): void {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  try {
    const raw = window.localStorage.getItem(MOCK_CONTENT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { dramas?: unknown; reviews?: unknown };
    if (!Array.isArray(parsed.dramas) || parsed.dramas.length === 0 || !Array.isArray(parsed.reviews)) return;
    state.dramas = (parsed.dramas as DramaRecord[]).map((drama) => backfillDramaTagIds(drama, state));
    state.reviews = parsed.reviews as ReviewItem[];
    persistMockContent(state);
  } catch {
    /* keep seed data */
  }
}
