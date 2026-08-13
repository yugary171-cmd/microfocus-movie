import type { CatalogResponse } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

type SectionKey = "featured" | "latest" | "popular";

Page({
  data: {
    loading: true,
    error: "",
    isMock: isMockMode(),
    activeSection: "featured" as SectionKey,
    catalog: null as CatalogResponse | null,
    visibleItems: [] as CatalogResponse[SectionKey]
  },

  onLoad() {
    void this.loadCatalog();
  },

  onPullDownRefresh() {
    void this.loadCatalog().finally(() => wx.stopPullDownRefresh());
  },

  async loadCatalog() {
    this.setData({ loading: true, error: "" });
    try {
      const catalog = await getApi().getCatalog();
      this.setData({ catalog, visibleItems: catalog.featured });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), catalog: null, visibleItems: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  selectSection(event: WechatMiniprogram.TouchEvent) {
    const section = event.currentTarget.dataset.section as SectionKey;
    const catalog = this.data.catalog;
    if (!catalog || !["featured", "latest", "popular"].includes(section)) return;
    this.setData({ activeSection: section, visibleItems: catalog[section] });
  },

  openCategory(event: WechatMiniprogram.TouchEvent) {
    const category = String(event.currentTarget.dataset.category || "");
    wx.setStorageSync("microfocus.pending-category", category);
    wx.switchTab({ url: "/pages/category/index" });
  }
});
