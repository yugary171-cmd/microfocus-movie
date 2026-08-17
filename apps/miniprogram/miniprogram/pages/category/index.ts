import { SEARCH_PAGE_SIZE, type DramaCard } from "@microfocus/contracts";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  DEFAULT_DISCOVER_FILTERS,
  rankingHeatLabel,
  sortDiscoverItems,
  visibleDiscoverSections,
  type DiscoverFilterKey
} from "../../utils/discover";

function withView(items: DramaCard[], recommendation: string) {
  return sortDiscoverItems(items, recommendation).map((item) => ({
    ...item,
    heat: rankingHeatLabel(item.recommendationRank),
    tag: item.tags[0] || item.category
  }));
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
    items: [] as DramaCard[],
    results: [] as ReturnType<typeof withView>,
    page: 1,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: "",
    filtersExpanded: true,
    selectedFilters: { ...DEFAULT_DISCOVER_FILTERS },
    visibleSections: visibleDiscoverSections(true),
    pageSize: SEARCH_PAGE_SIZE,
    navInsetTop: 52
  },

  onLoad() {
    this.setData({ navInsetTop: measureNavInsetTop() });
    void this.search(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) void this.search(false);
  },

  selectFilter(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "") as DiscoverFilterKey;
    const value = String(event.currentTarget.dataset.value || "");
    if (!key || !value) return;
    this.setData({
      selectedFilters: { ...this.data.selectedFilters, [key]: value }
    });
    void this.search(true);
  },

  toggleExpanded() {
    const filtersExpanded = !this.data.filtersExpanded;
    this.setData({
      filtersExpanded,
      visibleSections: visibleDiscoverSections(filtersExpanded)
    });
  },

  async search(reset: boolean) {
    if (this.data.loadingMore) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    try {
      const format = this.data.selectedFilters.format;
      const response = await getApi().search(
        "",
        format === "全部体裁" ? "" : format,
        page,
        {
          subject: this.data.selectedFilters.subject === "全部主题" ? "" : this.data.selectedFilters.subject,
          setting: this.data.selectedFilters.setting === "全部设定" ? "" : this.data.selectedFilters.setting,
          background: this.data.selectedFilters.background === "全部背景" ? "" : this.data.selectedFilters.background
        }
      );
      const nextItems = Array.isArray(response.items) ? response.items : [];
      const items = reset ? nextItems : this.data.items.concat(nextItems);
      this.setData({
        items,
        results: withView(items, this.data.selectedFilters.recommendation),
        page: response.page || page,
        hasMore: Boolean(response.hasMore)
      });
    } catch (error) {
      this.setData({
        error: toFriendlyErrorMessage(error),
        items: reset ? [] : this.data.items,
        results: reset ? [] : this.data.results
      });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  openDrama(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    wx.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` });
  },

  goBack() {
    wx.navigateBack();
  }
});
