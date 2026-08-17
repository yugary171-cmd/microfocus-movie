import type { DramaCard, HomeFilterOptions } from "@microfocus/contracts";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  RANKING_TABS,
  RANKING_TYPES,
  rankingHeatLabel,
  rankingUpdatedCopy,
  sortRankingItems
} from "../../utils/discover";

const emptyFilters = { subject: "", setting: "", background: "" };

function withView(items: DramaCard[], type: string) {
  return sortRankingItems(items, type).map((item, index) => ({
    ...item,
    heat: rankingHeatLabel(item.recommendationRank),
    rankClass: `rank-${Math.min(index, 3)}`,
    rankLabel: String(index + 1),
    initial: item.title.slice(0, 1)
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

function buildDrawerSections(options: HomeFilterOptions, draft: typeof emptyFilters) {
  return [
    { key: "subject" as const, title: "全部主题", values: Array.isArray(options.subjects) ? options.subjects : [] },
    { key: "setting" as const, title: "全部设定", values: Array.isArray(options.settings) ? options.settings : [] },
    { key: "background" as const, title: "全部背景", values: Array.isArray(options.backgrounds) ? options.backgrounds : [] }
  ].map((section) => ({
    ...section,
    values: section.values.map((value) => ({
      value,
      selected: draft[section.key] === value
    }))
  }));
}

Page({
  data: {
    tabs: [...RANKING_TABS],
    rankingTypes: [...RANKING_TYPES],
    activeTab: "全部",
    activeRanking: "推荐榜",
    drawerOpen: false,
    items: [] as DramaCard[],
    views: [] as ReturnType<typeof withView>,
    page: 1,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: "",
    updatedCopy: rankingUpdatedCopy(),
    navInsetTop: 52,
    draftDrawer: { ...emptyFilters },
    appliedDrawer: { ...emptyFilters },
    filterOptions: { subjects: [], settings: [], backgrounds: [] } as HomeFilterOptions,
    drawerSections: buildDrawerSections({ subjects: [], settings: [], backgrounds: [] }, emptyFilters)
  },

  onLoad() {
    this.setData({ navInsetTop: measureNavInsetTop() });
    void this.bootstrap();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) void this.load(false);
  },

  async bootstrap() {
    try {
      const catalog = await getApi().getCatalog();
      const filterOptions = catalog.filterOptions || { subjects: [], settings: [], backgrounds: [] };
      this.setData({
        filterOptions,
        drawerSections: buildDrawerSections(filterOptions, this.data.draftDrawer)
      });
    } catch {
      const filterOptions = { subjects: [], settings: [], backgrounds: [] };
      this.setData({
        filterOptions,
        drawerSections: buildDrawerSections(filterOptions, emptyFilters)
      });
    }
    await this.load(true);
  },

  selectTab(event: WechatMiniprogram.TouchEvent) {
    this.setData({
      activeTab: String(event.currentTarget.dataset.tab || "全部"),
      appliedDrawer: { ...emptyFilters },
      draftDrawer: { ...emptyFilters }
    });
    void this.load(true);
  },

  selectRanking(event: WechatMiniprogram.TouchEvent) {
    const activeRanking = String(event.currentTarget.dataset.type || "推荐榜");
    this.setData({
      activeRanking,
      views: withView(this.data.items, activeRanking)
    });
  },

  openDrawer() {
    const draftDrawer = { ...this.data.appliedDrawer };
    this.setData({
      draftDrawer,
      drawerSections: buildDrawerSections(this.data.filterOptions, draftDrawer),
      drawerOpen: true
    });
  },

  closeDrawer() {
    this.setData({ drawerOpen: false });
  },

  clearDrawer() {
    const draftDrawer = { ...emptyFilters };
    this.setData({
      draftDrawer,
      drawerSections: buildDrawerSections(this.data.filterOptions, draftDrawer)
    });
  },

  confirmDrawer() {
    this.setData({
      appliedDrawer: { ...this.data.draftDrawer },
      drawerOpen: false
    });
    void this.load(true);
  },

  selectDrawerOption(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "") as keyof typeof emptyFilters;
    const value = String(event.currentTarget.dataset.value || "");
    if (!key || !value) return;
    const current = this.data.draftDrawer[key];
    const draftDrawer = { ...this.data.draftDrawer, [key]: current === value ? "" : value };
    this.setData({
      draftDrawer,
      drawerSections: buildDrawerSections(this.data.filterOptions, draftDrawer)
    });
  },

  async load(reset: boolean) {
    if (this.data.loadingMore) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    try {
      const result = await getApi().search(
        "",
        this.data.activeTab === "全部" ? "" : this.data.activeTab,
        page,
        this.data.appliedDrawer
      );
      const items = reset ? result.items : this.data.items.concat(result.items);
      this.setData({
        items,
        views: withView(items, this.data.activeRanking),
        page: result.page || page,
        hasMore: Boolean(result.hasMore)
      });
    } catch (error) {
      this.setData({
        error: toFriendlyErrorMessage(error),
        items: reset ? [] : this.data.items,
        views: reset ? [] : this.data.views
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
  },

  noop() {}
});
