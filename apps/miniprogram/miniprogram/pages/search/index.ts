type HotSearch = {
  rank: number;
  title: string;
  tag: string;
  heat: string;
};

const HOT_SEARCHES: HotSearch[] = [
  { rank: 1, title: "她在月光下失忆", tag: "热", heat: "982 万" },
  { rank: 2, title: "闪婚后，傅总他真香了", tag: "爆", heat: "835 万" },
  { rank: 3, title: "穿书后我成了团宠", tag: "新", heat: "721 万" },
  { rank: 4, title: "重回十八岁", tag: "", heat: "609 万" },
  { rank: 5, title: "向晚而生", tag: "", heat: "548 万" },
  { rank: 6, title: "听见你的心声", tag: "", heat: "497 万" }
];

const SUGGESTIONS = ["先婚后爱", "甜宠", "逆袭", "重生", "豪门", "悬疑"];

Page({
  data: {
    query: "",
    suggestions: SUGGESTIONS,
    hotSearches: HOT_SEARCHES,
    visibleHotSearches: HOT_SEARCHES
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  onQueryInput(event: WechatMiniprogram.Input) {
    const query = event.detail.value;
    this.setData({ query, visibleHotSearches: this.filterHotSearches(query) });
  },

  submitSearch() {
    const query = this.data.query.trim();
    this.setData({ query, visibleHotSearches: this.filterHotSearches(query) });
    wx.showToast({ title: query ? `正在搜索“${query}”` : "请输入搜索内容", icon: "none" });
  },

  chooseSuggestion(event: WechatMiniprogram.TouchEvent) {
    const query = String(event.currentTarget.dataset.query || "");
    this.setData({ query, visibleHotSearches: this.filterHotSearches(query) });
  },

  chooseHotSearch(event: WechatMiniprogram.TouchEvent) {
    const query = String(event.currentTarget.dataset.title || "");
    this.setData({ query, visibleHotSearches: this.filterHotSearches(query) });
    wx.showToast({ title: `正在搜索“${query}”`, icon: "none" });
  },

  filterHotSearches(query: string) {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return HOT_SEARCHES;
    return HOT_SEARCHES.filter((item) => item.title.toLowerCase().includes(keyword));
  }
});
