import { LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
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
import { getMockFavoriteCards, getMockHistoryCards, getMockLikeCards } from "../../mocks/history-state";
import {
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
import {
  FAVORITE_TAB,
  HISTORY_TAB,
  INBOX_ITEMS,
  isFormatLibraryTab,
  isLibraryTab,
  LIBRARY_EDIT_COPY,
  LIBRARY_TABS,
  LIKE_TAB,
  parseLibraryGridTab
} from "../../utils/inbox-view";

function isHistoryFormatId(value: string): value is HistoryFormatId {
  return HISTORY_FORMAT_OPTIONS.some((item) => item.id === value);
}

type UserView = { displayName: string; microfocusId: string; initial: string; avatarUrl: string };

function sourceItemsForTab(
  tab: string,
  historyItems: HistoryCardView[],
  favoriteItems: HistoryCardView[],
  likeItems: HistoryCardView[]
) {
  if (tab === FAVORITE_TAB) return favoriteItems;
  if (tab === LIKE_TAB) return likeItems;
  return historyItems;
}

function visibleHistoryState(
  tab: string,
  historyItems: HistoryCardView[],
  favoriteItems: HistoryCardView[],
  likeItems: HistoryCardView[],
  completion: string,
  format: HistoryFormatId,
  sheet: HistorySheetFilter,
  query = ""
) {
  const isFormatTab = isFormatLibraryTab(tab);
  const copy = LIBRARY_EDIT_COPY[isFormatTab ? parseLibraryGridTab(tab) : HISTORY_TAB];
  const source = sourceItemsForTab(tab, historyItems, favoriteItems, likeItems);
  const safeCompletion: HistoryCompletionFilter = isHistoryCompletionFilter(completion) ? completion : "全部";
  return {
    isFormatTab,
    searchPlaceholder: copy.search,
    mockLabel: copy.mockLabel,
    emptyLabel: copy.empty,
    sourceEmpty: source.length === 0,
    visibleHistoryItems: filterHistoryItems(source, {
      completion: isFormatTab ? "全部" : safeCompletion,
      sheet: isFormatTab ? { format, duration: "all", time: "all" } : sheet,
      query
    }),
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
    historyItems: (isMockMode() ? getMockHistoryCards() : []) as HistoryCardView[],
    favoriteItems: (isMockMode() ? getMockFavoriteCards() : []) as HistoryCardView[],
    likeItems: (isMockMode() ? getMockLikeCards() : []) as HistoryCardView[],
    visibleHistoryItems: (isMockMode() ? getMockHistoryCards() : []) as HistoryCardView[],
    isFormatTab: false,
    activeFormat: "all" as HistoryFormatId,
    searchPlaceholder: LIBRARY_EDIT_COPY[HISTORY_TAB].search,
    mockLabel: LIBRARY_EDIT_COPY[HISTORY_TAB].mockLabel,
    emptyLabel: LIBRARY_EDIT_COPY[HISTORY_TAB].empty,
    sourceEmpty: !isMockMode(),
    inboxItems: INBOX_ITEMS,
    avatarSaving: false,
    filterOpen: false,
    sheetFilterActive: false,
    appliedSheetFilter: cloneHistorySheetFilter(),
    draftSheetFilter: cloneHistorySheetFilter(),
    formatOptions: HISTORY_FORMAT_OPTIONS,
    durationOptions: HISTORY_DURATION_OPTIONS,
    timeOptions: HISTORY_TIME_OPTIONS,
    historySearchOpen: false,
    historyQuery: "",
    queryMaxLength: LIST_QUERY_MAX_LENGTH
  },

  onShow() {
    const user = toUserView(getStoredSession());
    if (this.data.isMock) {
      const historyItems = getMockHistoryCards();
      const favoriteItems = getMockFavoriteCards();
      const likeItems = getMockLikeCards();
      this.setData({
        user,
        historyItems,
        favoriteItems,
        likeItems,
        ...visibleHistoryState(
          this.data.activeHistoryTab,
          historyItems,
          favoriteItems,
          likeItems,
          this.data.activeFilter,
          this.data.activeFormat,
          this.data.appliedSheetFilter,
          this.data.historyQuery
        )
      });
      return;
    }
    this.setData({ user });
    if (user) void this.loadLiveHistory();
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
    const tab = String(event.currentTarget.dataset.tab || HISTORY_TAB);
    const activeHistoryTab = isLibraryTab(tab) ? tab : HISTORY_TAB;
    this.setData({
      activeHistoryTab,
      historySearchOpen: false,
      historyQuery: "",
      ...visibleHistoryState(
        activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        this.data.activeFilter,
        this.data.activeFormat,
        this.data.appliedSheetFilter,
        ""
      )
    });
  },

  async loadLiveHistory() {
    this.setData({ historyLoading: true, historyError: "" });
    try {
      const history = await getApi().getHistory();
      const historyItems = toHistoryCardViews(history);
      this.setData({
        historyItems,
        ...visibleHistoryState(
          this.data.activeHistoryTab,
          historyItems,
          this.data.favoriteItems,
          this.data.likeItems,
          this.data.activeFilter,
          this.data.activeFormat,
          this.data.appliedSheetFilter,
          this.data.historyQuery
        )
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
      ...visibleHistoryState(
        this.data.activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        activeFilter,
        this.data.activeFormat,
        this.data.appliedSheetFilter,
        this.data.historyQuery
      )
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
      ...visibleHistoryState(
        this.data.activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        this.data.activeFilter,
        this.data.activeFormat,
        appliedSheetFilter,
        this.data.historyQuery
      )
    });
  },

  openHistorySearch() {
    this.setData({ historySearchOpen: true });
  },

  closeHistorySearch() {
    this.setData({
      historySearchOpen: false,
      historyQuery: "",
      ...visibleHistoryState(
        this.data.activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        this.data.activeFilter,
        this.data.activeFormat,
        this.data.appliedSheetFilter,
        ""
      )
    });
  },

  onHistoryQuery(event: { detail?: { value?: string } }) {
    const historyQuery = String(event.detail?.value || "");
    this.setData({
      historyQuery,
      ...visibleHistoryState(
        this.data.activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        this.data.activeFilter,
        this.data.activeFormat,
        this.data.appliedSheetFilter,
        historyQuery
      )
    });
  },

  openProfile() {
    wx.navigateTo({ url: "/pages/profile/edit" });
  },

  selectFormatFilter(event: WechatMiniprogram.TouchEvent) {
    const next = String(event.currentTarget.dataset.id || "all");
    const activeFormat = isHistoryFormatId(next) ? next : "all";
    this.setData({
      activeFormat,
      ...visibleHistoryState(
        this.data.activeHistoryTab,
        this.data.historyItems,
        this.data.favoriteItems,
        this.data.likeItems,
        this.data.activeFilter,
        activeFormat,
        this.data.appliedSheetFilter,
        this.data.historyQuery
      )
    });
  },

  openHistoryEdit() {
    wx.navigateTo({
      url: `/pages/history/edit?tab=${encodeURIComponent(this.data.activeHistoryTab)}`
    });
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
    const item = sourceItemsForTab(
      this.data.activeHistoryTab,
      this.data.historyItems,
      this.data.favoriteItems,
      this.data.likeItems
    ).find((entry) => entry.id === id);
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
