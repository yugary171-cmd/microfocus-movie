import {
  applyLocalWechatProfile,
  ensureSession,
  getApi,
  getStoredSession,
  isMockMode,
  saveProfile
} from "../../services/api";
import { isWechatProfileAuthorizationDenied, wechatAdapter } from "../../services/wechat-adapter";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  createMockHistoryCards,
  playerUrlFromHistory,
  toHistoryCardViews,
  type HistoryCardView
} from "../../utils/history-view";
import {
  cloneHistorySheetFilter,
  DEFAULT_HISTORY_SHEET_FILTER,
  filterHistoryItems,
  HISTORY_COMPLETION_FILTERS,
  HISTORY_DURATION_OPTIONS,
  HISTORY_FORMAT_OPTIONS,
  HISTORY_TIME_OPTIONS,
  isDefaultHistorySheetFilter,
  isHistoryCompletionFilter,
  type HistoryCompletionFilter,
  type HistoryDurationId,
  type HistoryFormatId,
  type HistorySheetFilter,
  type HistoryTimeId
} from "../../utils/history-filter";
import { INBOX_ITEMS, isLibraryTab, LIBRARY_TABS } from "../../utils/inbox-view";

const HISTORY_ITEMS: HistoryCardView[] = createMockHistoryCards();

type UserView = { displayName: string; microfocusId: string; initial: string; avatarUrl: string };

function visibleHistoryState(
  items: HistoryCardView[],
  completion: string,
  sheet: HistorySheetFilter
) {
  const safeCompletion: HistoryCompletionFilter = isHistoryCompletionFilter(completion) ? completion : "全部";
  return {
    visibleHistoryItems: filterHistoryItems(items, { completion: safeCompletion, sheet }),
    sheetFilterActive: !isDefaultHistorySheetFilter(sheet)
  };
}

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
    historyTabs: [...LIBRARY_TABS],
    historyFilters: [...HISTORY_COMPLETION_FILTERS],
    activeFilter: "全部" as HistoryCompletionFilter,
    historyItems: (isMockMode() ? HISTORY_ITEMS : []) as HistoryCardView[],
    visibleHistoryItems: (isMockMode() ? HISTORY_ITEMS : []) as HistoryCardView[],
    inboxItems: INBOX_ITEMS,
    avatarSaving: false,
    filterOpen: false,
    sheetFilterActive: false,
    appliedSheetFilter: cloneHistorySheetFilter(),
    draftSheetFilter: cloneHistorySheetFilter(),
    formatOptions: HISTORY_FORMAT_OPTIONS,
    durationOptions: HISTORY_DURATION_OPTIONS,
    timeOptions: HISTORY_TIME_OPTIONS
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
    const tab = String(event.currentTarget.dataset.tab || "历史");
    this.setData({ activeHistoryTab: isLibraryTab(tab) ? tab : "历史" });
  },

  async loadLiveHistory() {
    this.setData({ historyLoading: true, historyError: "" });
    try {
      const history = await getApi().getHistory();
      const historyItems = toHistoryCardViews(history);
      this.setData({
        historyItems,
        ...visibleHistoryState(historyItems, this.data.activeFilter, this.data.appliedSheetFilter)
      });
    } catch (error) {
      this.setData({ historyError: toFriendlyErrorMessage(error) });
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  selectFilter(event: WechatMiniprogram.TouchEvent) {
    const next = String(event.currentTarget.dataset.filter || "全部");
    const activeFilter = isHistoryCompletionFilter(next) ? next : "全部";
    this.setData({
      activeFilter,
      ...visibleHistoryState(this.data.historyItems, activeFilter, this.data.appliedSheetFilter)
    });
  },

  preventMove() {},

  openHistoryFilter() {
    if (this.data.filterOpen) return;
    const draftSheetFilter = cloneHistorySheetFilter(this.data.appliedSheetFilter);
    setTimeout(() => {
      this.setData({ filterOpen: true, draftSheetFilter });
    }, 50);
  },

  closeHistoryFilter() {
    this.setData({
      filterOpen: false,
      draftSheetFilter: cloneHistorySheetFilter(this.data.appliedSheetFilter)
    });
  },

  selectDraftFormat(event: WechatMiniprogram.TouchEvent) {
    const format = String(event.currentTarget.dataset.id || "all") as HistoryFormatId;
    this.setData({ draftSheetFilter: { ...this.data.draftSheetFilter, format } });
  },

  selectDraftDuration(event: WechatMiniprogram.TouchEvent) {
    const duration = String(event.currentTarget.dataset.id || "all") as HistoryDurationId;
    this.setData({ draftSheetFilter: { ...this.data.draftSheetFilter, duration } });
  },

  selectDraftTime(event: WechatMiniprogram.TouchEvent) {
    const time = String(event.currentTarget.dataset.id || "all") as HistoryTimeId;
    this.setData({ draftSheetFilter: { ...this.data.draftSheetFilter, time } });
  },

  clearDraftHistoryFilter() {
    this.setData({ draftSheetFilter: cloneHistorySheetFilter(DEFAULT_HISTORY_SHEET_FILTER) });
  },

  confirmHistoryFilter() {
    const appliedSheetFilter = cloneHistorySheetFilter(this.data.draftSheetFilter);
    this.setData({
      appliedSheetFilter,
      filterOpen: false,
      ...visibleHistoryState(this.data.historyItems, this.data.activeFilter, appliedSheetFilter)
    });
  },

  showFeature(event: WechatMiniprogram.TouchEvent) {
    const label = String(event.currentTarget.dataset.label || "功能");
    wx.showToast({ title: `${label}为体验数据`, icon: "none" });
  },

  openProfile() {
    wx.navigateTo({ url: "/pages/profile/edit" });
  },

  async onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
    const avatarUrl = String(event.detail?.avatarUrl || "").trim();
    if (!avatarUrl || this.data.avatarSaving || !this.data.user) return;
    this.setData({ avatarSaving: true });
    try {
      const stored = await saveProfile({ avatarUrl });
      this.setData({ user: toUserView(stored) ?? { ...this.data.user, avatarUrl: stored?.user.avatarUrl || avatarUrl } });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ avatarSaving: false });
    }
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
