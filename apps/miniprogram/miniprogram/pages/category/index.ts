import type { DramaCard } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

Page({
  data: {
    isMock: isMockMode(),
    query: "",
    category: "全部",
    categories: ["全部"] as string[],
    results: [] as DramaCard[],
    page: 1,
    hasMore: false,
    loading: true,
    loadingMore: false,
    searched: false,
    error: ""
  },

  onLoad() {
    void this.loadCategoriesAndSearch();
  },

  onShow() {
    const pending = wx.getStorageSync<string>("microfocus.pending-category");
    if (pending) {
      wx.removeStorageSync("microfocus.pending-category");
      this.setData({ category: pending });
      void this.search(true);
    }
  },

  async loadCategoriesAndSearch() {
    try {
      const catalog = await getApi().getCatalog();
      this.setData({ categories: catalog.categories.includes("全部") ? catalog.categories : ["全部", ...catalog.categories] });
    } catch {
      // Search still works when category suggestions fail.
    }
    await this.search(true);
  },

  onQueryInput(event: WechatMiniprogram.Input) {
    this.setData({ query: event.detail.value });
  },

  onSearchConfirm() {
    void this.search(true);
  },

  selectCategory(event: WechatMiniprogram.TouchEvent) {
    this.setData({ category: String(event.currentTarget.dataset.category || "全部") });
    void this.search(true);
  },

  async search(reset: boolean) {
    if (this.data.loadingMore) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true, error: "" });
    try {
      const response = await getApi().search(
        this.data.query.trim(),
        this.data.category === "全部" ? "" : this.data.category,
        page
      );
      this.setData({
        results: reset ? response.items : [...this.data.results, ...response.items],
        page: response.page || page,
        hasMore: Boolean(response.hasMore),
        searched: true
      });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), searched: true });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  loadMore() {
    if (this.data.hasMore) void this.search(false);
  }
});
