import { boundListQuery, LIST_QUERY_MAX_LENGTH, type CatalogResponse } from "@microfocus/contracts";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

const SEARCH_PLACEHOLDER = "我的26岁女房客";
const SEARCH_HISTORY_KEY = "microfocus.search.history";
const SEARCH_HISTORY_LIMIT = 10;

function pickGuesses(pool: readonly string[], seed: number): string[] {
  if (!pool.length) return [];
  const offset = Math.abs(seed) % pool.length;
  return Array.from({ length: Math.min(8, pool.length) }, (_, index) => pool[(offset + index) % pool.length] || "");
}

function publishedTitlesFromCatalog(catalog: CatalogResponse): string[] {
  const titles = [
    ...(Array.isArray(catalog.latest) ? catalog.latest : []),
    ...(Array.isArray(catalog.popular) ? catalog.popular : []),
    ...(Array.isArray(catalog.featured) ? catalog.featured : [])
  ].map((item) => item.title.trim()).filter(Boolean);
  return [...new Set(titles)];
}

function randomPublishedTitle(catalog: CatalogResponse): string {
  const titles = [...(Array.isArray(catalog.latest) ? catalog.latest : []), ...(Array.isArray(catalog.popular) ? catalog.popular : []), ...(Array.isArray(catalog.featured) ? catalog.featured : [])]
    .map((item) => item.title.trim())
    .filter(Boolean);
  const uniqueTitles = [...new Set(titles)];
  return uniqueTitles[Math.floor(Math.random() * uniqueTitles.length)] || SEARCH_PLACEHOLDER;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequestId = 0;

function readSearchHistory(): string[] {
  try {
    const stored = wx.getStorageSync(SEARCH_HISTORY_KEY);
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(items: string[]) {
  try {
    wx.setStorageSync(SEARCH_HISTORY_KEY, items);
  } catch {
    // Local history is optional and must not block search.
  }
}

function measureNavInsetTop(): number {
  try {
    const info = wx.getSystemInfoSync();
    const statusBar = Number(info.statusBarHeight) || 20;
    const menu = wx.getMenuButtonBoundingClientRect();
    const menuBottom = Number(menu?.bottom);
    return (Number.isFinite(menuBottom) && menuBottom > 0 ? menuBottom : statusBar + 32) + 8;
  } catch {
    return 52;
  }
}

Page({
  data: {
    query: "",
    searchPlaceholder: SEARCH_PLACEHOLDER,
    searchHistory: [] as string[],
    queryMaxLength: LIST_QUERY_MAX_LENGTH,
    publishedTitles: [] as string[],
    guesses: [] as string[],
    results: [] as Array<{ id: string; title: string; category: string; episodeCount: number }>,
    searched: false,
    loading: false,
    error: "",
    navInsetTop: 52
  },

  onShow() {
    this.setData({ navInsetTop: measureNavInsetTop() });
    this.setData({ searchHistory: readSearchHistory() });
    void this.refreshSearchDiscovery();
  },

  async refreshSearchDiscovery() {
    try {
      const catalog = await getApi().getCatalog();
      const publishedTitles = publishedTitlesFromCatalog(catalog);
      this.setData({
        searchPlaceholder: randomPublishedTitle(catalog),
        publishedTitles,
        guesses: pickGuesses(publishedTitles, Date.now())
      });
    } catch {
      this.setData({ searchPlaceholder: SEARCH_PLACEHOLDER, publishedTitles: [], guesses: [] });
    }
  },

  onLoad(options: Record<string, string | undefined>) {
    const initial = options?.q ? boundListQuery(decodeURIComponent(options.q)) : "";
    if (initial) {
      this.setData({ query: initial });
      void this.runSearch(initial);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onQueryInput(event: WechatMiniprogram.Input) {
    const query = event.detail.value.slice(0, LIST_QUERY_MAX_LENGTH);
    this.setData({ query });
    if (searchTimer) clearTimeout(searchTimer);
    if (!query) {
      searchRequestId += 1;
      this.setData({ results: [], searched: false, error: "", loading: false });
      return;
    }
    searchTimer = setTimeout(() => void this.runSearch(), 220);
  },

  async runSearch(input?: string, remember = false) {
    const query = boundListQuery(input ?? this.data.query);
    if (!query) {
      wx.showToast({ title: "请输入搜索内容", icon: "none" });
      return;
    }
    this.setData({ query, searched: true, loading: true, error: "" });
    const requestId = ++searchRequestId;
    try {
      const response = await getApi().search(query, "", 1);
      if (requestId !== searchRequestId) return;
      this.setData({ results: Array.isArray(response.items) ? response.items : [] });
      if (remember) {
        const history = [query, ...this.data.searchHistory.filter((item: string) => item !== query)].slice(0, SEARCH_HISTORY_LIMIT);
        this.setData({ searchHistory: history });
        writeSearchHistory(history);
      }
    } catch (error) {
      if (requestId !== searchRequestId) return;
      this.setData({ results: [], error: toFriendlyErrorMessage(error) });
    } finally {
      if (requestId === searchRequestId) this.setData({ loading: false });
    }
  },

  submitSearch() {
    if (!this.data.query.trim()) this.setData({ query: this.data.searchPlaceholder });
    void this.runSearch(undefined, true);
  },

  chooseGuess(event: WechatMiniprogram.TouchEvent) {
    const query = boundListQuery(String(event.currentTarget.dataset.query || ""));
    this.setData({ query });
    void this.runSearch(query, true);
  },

  refreshGuesses() {
    this.setData({ guesses: pickGuesses(this.data.publishedTitles, Date.now()) });
  },

  clearSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchRequestId += 1;
    this.setData({ query: "", results: [], searched: false, error: "", loading: false });
  },

  chooseHistory(event: WechatMiniprogram.TouchEvent) {
    const query = boundListQuery(String(event.currentTarget.dataset.query || ""));
    this.setData({ query });
    void this.runSearch(query, true);
  },

  removeHistory(event: WechatMiniprogram.TouchEvent) {
    const value = String(event.currentTarget.dataset.query || "");
    const history = this.data.searchHistory.filter((item: string) => item !== value);
    this.setData({ searchHistory: history });
    writeSearchHistory(history);
  },

  clearHistory() {
    this.setData({ searchHistory: [] });
    writeSearchHistory([]);
  },

  openDrama(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` });
  }
});
