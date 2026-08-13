import type { WatchHistoryItem } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { formatPosition } from "../../utils/format";

interface HistoryView extends WatchHistoryItem {
  historyKey: string;
  positionLabel: string;
  updatedLabel: string;
}

function formatUpdatedAt(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "更新时间未知";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚看过";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

Page({
  data: {
    isMock: isMockMode(),
    loading: true,
    resumingId: "",
    error: "",
    history: [] as HistoryView[]
  },

  onShow() {
    void this.loadHistory();
  },

  onPullDownRefresh() {
    void this.loadHistory().finally(() => wx.stopPullDownRefresh());
  },

  async loadHistory() {
    this.setData({ loading: true, error: "" });
    try {
      const history = await getApi().getHistory();
      this.setData({
        history: history.map((item) => ({
          ...item,
          historyKey: `${item.drama.id}-${item.episodeNumber}`,
          positionLabel: formatPosition(item.mediaPositionSeconds),
          updatedLabel: formatUpdatedAt(item.updatedAt)
        }))
      });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), history: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  async resume(event: WechatMiniprogram.TouchEvent) {
    const dramaId = String(event.currentTarget.dataset.dramaId || "");
    const episodeNumber = Number(event.currentTarget.dataset.episodeNumber);
    const historyItem = this.data.history.find(
      (item) => item.drama.id === dramaId && item.episodeNumber === episodeNumber
    );
    if (!historyItem || this.data.resumingId) return;
    this.setData({ resumingId: dramaId });
    try {
      const detail = await getApi().getDrama(dramaId);
      const episode = detail.episodes.find((item) => item.episodeNumber === episodeNumber);
      if (!episode) throw new Error("历史记录对应的剧集已不存在");
      wx.navigateTo({
        url: `/pages/player/index?dramaId=${encodeURIComponent(dramaId)}&episodeId=${encodeURIComponent(episode.id)}&title=${encodeURIComponent(detail.title)}&episodeNumber=${episodeNumber}&position=${Math.max(0, historyItem.mediaPositionSeconds)}`
      });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ resumingId: "" });
    }
  },

  openDrama(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` });
  }
});
