import { getApi, getStoredSession, isMockMode } from "../../services/api";
import { deleteMockLibraryCards, getMockLibraryCards } from "../../mocks/history-state";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { toHistoryCardViews, type HistoryCardView } from "../../utils/history-view";
import {
  HISTORY_TAB,
  LIBRARY_EDIT_COPY,
  parseLibraryGridTab,
  type LibraryGridTab
} from "../../utils/inbox-view";

type EditHistoryCard = HistoryCardView & { selected: boolean };

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

function itemKey(item: HistoryCardView): string {
  return item.dramaId || item.id;
}

function withSelection(items: HistoryCardView[], selectedIds: string[]): EditHistoryCard[] {
  const selected = new Set(selectedIds);
  return items.map((item) => ({ ...item, selected: selected.has(itemKey(item)) }));
}

Page({
  data: {
    isMock: isMockMode(),
    libraryTab: HISTORY_TAB as LibraryGridTab,
    title: LIBRARY_EDIT_COPY[HISTORY_TAB].title,
    empty: LIBRARY_EDIT_COPY[HISTORY_TAB].empty,
    confirm: LIBRARY_EDIT_COPY[HISTORY_TAB].confirm,
    loadingText: LIBRARY_EDIT_COPY[HISTORY_TAB].loading,
    navInsetTop: 52,
    items: [] as EditHistoryCard[],
    selectedIds: [] as string[],
    selectedCount: 0,
    canDelete: false,
    loading: false,
    error: "",
    confirmOpen: false,
    deleting: false
  },

  onLoad(query: { tab?: string }) {
    const libraryTab = parseLibraryGridTab(query?.tab ? decodeURIComponent(String(query.tab)) : HISTORY_TAB);
    const copy = LIBRARY_EDIT_COPY[libraryTab];
    this.setData({
      libraryTab,
      title: copy.title,
      empty: copy.empty,
      confirm: copy.confirm,
      loadingText: copy.loading
    });
  },

  onShow() {
    this.setData({ navInsetTop: measureNavInsetTop() });
    if (!this.data.isMock && !getStoredSession()) {
      wx.navigateBack();
      return;
    }
    void this.loadItems();
  },

  async loadItems(nextSelectedIds?: string[]) {
    this.setData({ loading: true, error: "" });
    try {
      let loaded: HistoryCardView[] = [];
      if (this.data.libraryTab === HISTORY_TAB && !this.data.isMock) {
        loaded = toHistoryCardViews(await getApi().getHistory());
      } else if (this.data.libraryTab === HISTORY_TAB || this.data.isMock) {
        loaded = getMockLibraryCards(this.data.libraryTab);
      }
      const available = new Set(loaded.map(itemKey).filter(Boolean));
      const selectedIds = (nextSelectedIds ?? this.data.selectedIds).filter((id) => available.has(id));
      this.setData({
        items: withSelection(loaded, selectedIds),
        selectedIds,
        selectedCount: selectedIds.length,
        canDelete: selectedIds.length > 0 && !this.data.deleting
      });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  setSelection(selectedIds: string[]) {
    this.setData({
      items: withSelection(this.data.items, selectedIds),
      selectedIds,
      selectedCount: selectedIds.length,
      canDelete: selectedIds.length > 0 && !this.data.deleting
    });
  },

  stopTap() {},

  selectAll() {
    this.setSelection(this.data.items.map(itemKey).filter(Boolean));
  },

  finish() {
    wx.navigateBack();
  },

  toggleItem(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.id || "");
    if (!key) return;
    const selectedIds = this.data.selectedIds.includes(key)
      ? this.data.selectedIds.filter((id) => id !== key)
      : [...this.data.selectedIds, key];
    this.setSelection(selectedIds);
  },

  openConfirm() {
    if (!this.data.canDelete) return;
    this.setData({ confirmOpen: true });
  },

  closeConfirm() {
    if (this.data.deleting) return;
    this.setData({ confirmOpen: false });
  },

  async confirmDelete() {
    if (!this.data.canDelete) return;
    this.setData({ deleting: true, canDelete: false });
    try {
      if (this.data.libraryTab === HISTORY_TAB) {
        await getApi().deleteHistory({ dramaIds: [...this.data.selectedIds] });
      } else if (this.data.isMock) {
        deleteMockLibraryCards(this.data.libraryTab, [...this.data.selectedIds]);
      }
      this.setData({ confirmOpen: false });
      await this.loadItems([]);
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (error) {
      this.setData({ confirmOpen: false });
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({
        deleting: false,
        canDelete: this.data.selectedIds.length > 0
      });
    }
  }
});
