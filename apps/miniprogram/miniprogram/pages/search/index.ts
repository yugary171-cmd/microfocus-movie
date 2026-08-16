import { boundListQuery, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

const GUESS_POOL: string[] = [
  "都重生了，谁还装富二代啊",
  "万妖图录传第一季",
  "我的26岁女房客",
  "皇后娘娘来打工",
  "她在月光下失忆",
  "再考公",
  "战神归来",
  "赘婿逆袭",
  "甜宠日常",
  "宫斗翻盘",
  "萌宝来报恩",
  "神医下山"
];

function pickGuesses(seed: number): string[] {
  const offset = Math.abs(seed) % GUESS_POOL.length;
  return Array.from({ length: 8 }, (_, index) => GUESS_POOL[(offset + index) % GUESS_POOL.length] || "");
}

Page({
  data: {
    query: "",
    queryMaxLength: LIST_QUERY_MAX_LENGTH,
    guesses: pickGuesses(Date.now()),
    results: [] as Array<{ id: string; title: string; category: string; episodeCount: number }>,
    searched: false,
    loading: false,
    error: ""
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
    this.setData({ query: event.detail.value.slice(0, LIST_QUERY_MAX_LENGTH) });
  },

  async runSearch(input?: string) {
    const query = boundListQuery(input ?? this.data.query);
    if (!query) {
      wx.showToast({ title: "请输入搜索内容", icon: "none" });
      return;
    }
    this.setData({ query, searched: true, loading: true, error: "" });
    try {
      const response = await getApi().search(query, "", 1);
      this.setData({ results: Array.isArray(response.items) ? response.items : [] });
    } catch (error) {
      this.setData({ results: [], error: toFriendlyErrorMessage(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  submitSearch() {
    void this.runSearch();
  },

  chooseGuess(event: WechatMiniprogram.TouchEvent) {
    const query = boundListQuery(String(event.currentTarget.dataset.query || ""));
    this.setData({ query });
    void this.runSearch(query);
  },

  refreshGuesses() {
    this.setData({ guesses: pickGuesses(Date.now()) });
  },

  clearSearch() {
    this.setData({ query: "", results: [], searched: false, error: "" });
  },

  openDrama(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` });
  }
});
