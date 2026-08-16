const rankingTypes = ["推荐榜", "热播榜", "热搜榜", "收藏榜"];

Page({
  data: {
    tabs: ["全部", "真人剧", "漫剧", "AI 剧"],
    rankingTypes,
    activeTab: "全部",
    activeRanking: "推荐榜",
    drawerOpen: false
  },

  selectTab(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeTab: String(event.currentTarget.dataset.tab || "全部") });
  },

  selectRanking(event: WechatMiniprogram.TouchEvent) {
    this.setData({
      activeRanking: String(event.currentTarget.dataset.type || "推荐榜"),
      drawerOpen: false
    });
  },

  openDrawer() { this.setData({ drawerOpen: true }); },
  closeDrawer() { this.setData({ drawerOpen: false }); },
  noop() {}
});
