import {
  applyLocalWechatProfile,
  ensureSession,
  getApi,
  getStoredSession,
  isMockMode
} from "../../services/api";
import { isWechatProfileAuthorizationDenied, wechatAdapter } from "../../services/wechat-adapter";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  playerUrlFromHistory,
  toHistoryCardViews,
  type HistoryCardView
} from "../../utils/history-view";

const HISTORY_ITEMS: HistoryCardView[] = [
  { id: "history-1", title: "引她入室", episode: "1 集 / 58 集", tag: "真人剧", tone: "rose", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-2", title: "凤栖今朝", episode: "1 集 / 71 集", tag: "真人剧", tone: "blue", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-3", title: "春色撩撩", episode: "1 集 / 105 集", tag: "漫画", tone: "ink", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-4", title: "皇后娘娘来打工", episode: "1 集 / 80 集", tag: "真人剧", tone: "gold", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-5", title: "请君入我怀", episode: "1 集 / 60 集", tag: "真人剧", tone: "wine", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-6", title: "苏太太高调离婚了", episode: "1 集 / 52 集", tag: "真人剧", tone: "night", dramaId: "", episodeNumber: 1, position: 0 }
];

type UserView = { displayName: string; microfocusId: string; initial: string; avatarUrl: string };

function toUserView(session: ReturnType<typeof getStoredSession>): UserView | null {
  if (!session) return null;
  const name = session.user.displayName || "微信用户";
  return {
    displayName: name,
    microfocusId: `微焦号 · ${session.user.id.slice(0, 12).toUpperCase()}`,
    initial: name.slice(0, 1) || "微",
    avatarUrl: session.user.avatarUrl || ""
  };
}

Page({
  data: {
    user: null as UserView | null,
    isMock: isMockMode(),
    loginLoading: false,
    loginError: "",
    historyLoading: false,
    historyError: "",
    activeHistoryTab: "历史",
    historyTabs: ["历史", "收藏", "点赞"],
    historyFilters: ["全部", "已看完", "未看完"],
    activeFilter: "全部",
    historyItems: (isMockMode() ? HISTORY_ITEMS : []) as HistoryCardView[],
    utilities: [
      { title: "消息", subtitle: "1 条未读" },
      { title: "追更", subtitle: "管理追更" }
    ]
  },

  onShow() {
    const user = toUserView(getStoredSession());
    this.setData({ user });
    if (user && !this.data.isMock) void this.loadLiveHistory();
  },

  async login() {
    if (this.data.loginLoading) return;
    this.setData({ loginError: "" });
    try {
      const profile = await wechatAdapter.getUserProfile();
      this.setData({ loginLoading: true });
      await ensureSession();
      this.setData({ user: toUserView(applyLocalWechatProfile(profile)) });
      if (!this.data.isMock) await this.loadLiveHistory();
      wx.showToast({ title: "登录成功", icon: "success" });
    } catch (error) {
      if (isWechatProfileAuthorizationDenied(error)) {
        wx.showToast({ title: "已取消授权", icon: "none" });
        return;
      }
      this.setData({ loginError: toFriendlyErrorMessage(error) });
    } finally {
      this.setData({ loginLoading: false });
    }
  },

  selectHistoryTab(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeHistoryTab: String(event.currentTarget.dataset.tab || "历史") });
  },

  async loadLiveHistory() {
    this.setData({ historyLoading: true, historyError: "" });
    try {
      const history = await getApi().getHistory();
      this.setData({ historyItems: toHistoryCardViews(history) });
    } catch (error) {
      this.setData({ historyError: toFriendlyErrorMessage(error) });
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  selectFilter(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeFilter: String(event.currentTarget.dataset.filter || "全部") });
  },

  showFeature(event: WechatMiniprogram.TouchEvent) {
    const label = String(event.currentTarget.dataset.label || "功能");
    wx.showToast({ title: `${label}为体验数据`, icon: "none" });
  },

  openProfile() {
    wx.navigateTo({ url: "/pages/profile/edit" });
  },

  async openHistory(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    const item = this.data.historyItems.find((entry) => entry.id === id);
    if (!item) return;
    if (this.data.isMock || !item.dramaId) {
      wx.switchTab({ url: "/pages/theater/index" });
      return;
    }
    try {
      const drama = await getApi().getDrama(item.dramaId);
      const episode = drama.episodes.find((entry) => entry.episodeNumber === item.episodeNumber);
      if (!episode) throw new Error("该观看记录对应的剧集已不存在");
      wx.navigateTo({ url: playerUrlFromHistory(item, episode.id) });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    }
  }
});
