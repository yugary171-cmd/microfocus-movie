import type { DramaDetail, EntitlementSummary, EpisodeSummary } from "@microfocus/contracts";
import { ensureSession, getApi, getStoredSession, isMockMode } from "../../services/api";
import { dramaInLibraryPages, setDramaLibraryFlag } from "../../services/library";
import { trackFunnelEvent } from "../../services/telemetry";
import {
  createRewardDependencies,
  describeRewardResult,
  retryRewardConfirmation,
  runRewardFlow,
  type PendingRewardConfirmation,
  type RewardFlowDependencies,
  type RewardResult
} from "../../services/reward";
import { wechatAdapter } from "../../services/wechat-adapter";
import { canStartEpisode, isFreeEpisode } from "../../utils/episode";
import { getDeviceId } from "../../utils/device";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { episodeDurationsFromDrama, formatRewardUnlockCopy } from "../../utils/format";
import { buildDramaShareCard } from "../../utils/drama-share";
import { FAVORITE_TAB } from "../../utils/inbox-view";

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

Page({
  data: {
    id: "",
    isMock: isMockMode(),
    loading: true,
    error: "",
    drama: null as DramaDetail | null,
    navInsetTop: 52,
    summaryExpanded: false,
    summaryOverflow: false,
    isFavorite: false,
    favoriteLoading: false,
    entitlement: null as EntitlementSummary | null,
    unlockCopy: formatRewardUnlockCopy("", []),
    unlockVisible: false,
    unlockEpisode: null as EpisodeSummary | null,
    rewardLoading: false,
    loginLoading: false,
    rewardError: "",
    rewardRetryPending: false
  },

  rewardDependencies: null as RewardFlowDependencies | null,
  pendingRewardConfirmation: null as PendingRewardConfirmation | null,

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id, navInsetTop: measureNavInsetTop() });
    if (!id) {
      this.setData({ loading: false, error: "缺少短剧编号" });
      return;
    }
    void this.loadDetail();
  },

  onShow() {
    if (this.data.id && this.data.drama) {
      void this.loadEntitlement();
      void this.hydrateFavoriteState();
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  async loadDetail() {
    this.setData({ loading: true, error: "", summaryExpanded: false, summaryOverflow: false });
    try {
      const [drama, entitlement] = await Promise.all([
        getApi().getDrama(this.data.id),
        getApi().getEntitlement(this.data.id).catch(() => null)
      ]);
      this.setData({ drama });
      wx.nextTick(() => this.measureSummaryOverflow());
      this.applyEntitlement(entitlement);
      void this.hydrateFavoriteState();
      trackFunnelEvent("drama_detail_view", { dramaId: drama.id });
      wx.setNavigationBarTitle({ title: drama.title || "短剧详情" });
      if (!this.data.isMock) {
        try {
          wx.showShareMenu({ menus: ["shareAppMessage"] });
        } catch {
          // ignore
        }
      }
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), drama: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  toggleSummary() {
    this.setData({ summaryExpanded: !this.data.summaryExpanded });
  },

  measureSummaryOverflow() {
    wx.createSelectorQuery()
      .select(".summary-measure")
      .boundingClientRect((rect) => {
        const windowWidth = wx.getSystemInfoSync().windowWidth;
        const lineHeight = (28 * 1.6 * windowWidth) / 750;
        this.setData({ summaryOverflow: Boolean(rect && rect.height > lineHeight * 2 + 1) });
      })
      .exec();
  },

  async hydrateFavoriteState() {
    if (!this.data.id || (!this.data.isMock && !getStoredSession())) return;
    try {
      const isFavorite = await dramaInLibraryPages(
        (page) => getApi().social.getFavorites(page),
        this.data.id
      );
      this.setData({ isFavorite });
    } catch {
      // Keep the local flag when the library cannot be read.
    }
  },

  async toggleFavorite() {
    if (this.data.favoriteLoading || !this.data.id) return;
    if (!this.data.isMock && !getStoredSession()) {
      wx.showToast({ title: "请先登录后再收藏", icon: "none" });
      return;
    }
    const next = !this.data.isFavorite;
    this.setData({ favoriteLoading: true });
    try {
      await setDramaLibraryFlag(FAVORITE_TAB, this.data.id, next);
      this.setData({ isFavorite: next });
      wx.showToast({ title: next ? "已收藏到我的片单" : "已取消收藏", icon: "none" });
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    } finally {
      this.setData({ favoriteLoading: false });
    }
  },

  async loadEntitlement() {
    try {
      this.applyEntitlement(await getApi().getEntitlement(this.data.id));
    } catch {
      // Existing detail remains usable for free episodes.
    }
  },

  applyEntitlement(entitlement: EntitlementSummary | null) {
    const durations = episodeDurationsFromDrama(this.data.drama);
    this.setData({
      entitlement,
      unlockCopy: formatRewardUnlockCopy(this.data.drama?.title ?? "", durations)
    });
  },

  async loginForLockedEpisode(): Promise<boolean> {
    if (this.data.loginLoading) return false;
    this.setData({ loginLoading: true });
    try {
      const session = await ensureSession();
      await this.loadEntitlement();
      return Boolean(getStoredSession() ?? session);
    } catch (error) {
      wx.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
      return false;
    } finally {
      this.setData({ loginLoading: false });
    }
  },

  async selectEpisode(event: WechatMiniprogram.TouchEvent) {
    const episodeId = String(event.currentTarget.dataset.id || "");
    const episode = this.data.drama?.episodes.find((item) => item.id === episodeId);
    if (!episode || !this.data.drama) return;
    const remaining = this.data.entitlement?.remainingSeconds ?? 0;
    if (!canStartEpisode(episode.episodeNumber, remaining)) {
      if (!getStoredSession()) {
        trackFunnelEvent("lock_intercept_shown", {
          dramaId: this.data.drama.id,
          episodeNumber: episode.episodeNumber
        });
        if (!(await this.loginForLockedEpisode())) return;
        const refreshedRemaining = this.data.entitlement?.remainingSeconds ?? 0;
        if (canStartEpisode(episode.episodeNumber, refreshedRemaining)) {
          this.openPlayer(episode);
          return;
        }
      }
      this.setData({ unlockVisible: true, unlockEpisode: episode, rewardError: "" });
      trackFunnelEvent("lock_intercept_shown", {
        dramaId: this.data.drama.id,
        episodeNumber: episode.episodeNumber
      });
      return;
    }
    this.openPlayer(episode);
  },

  openPlayer(episode: EpisodeSummary) {
    const drama = this.data.drama;
    if (!drama) return;
    wx.navigateTo({
      url: `/pages/player/index?dramaId=${encodeURIComponent(drama.id)}&episodeId=${encodeURIComponent(episode.id)}&title=${encodeURIComponent(drama.title)}&episodeNumber=${episode.episodeNumber}`
    });
  },

  closeUnlock() {
    if (!this.data.rewardLoading) this.setData({ unlockVisible: false });
  },

  noop() {
    // Prevent the dialog tap from bubbling to the backdrop.
  },

  async watchRewardAd() {
    if (this.data.rewardLoading || !this.data.drama) return;
    this.setData({ rewardLoading: true, rewardError: "" });
    let result: RewardResult;
    if (this.pendingRewardConfirmation && this.rewardDependencies) {
      result = await retryRewardConfirmation(
        this.rewardDependencies,
        this.pendingRewardConfirmation
      );
    } else {
      this.rewardDependencies = createRewardDependencies(
        getApi(),
        this.data.drama.id,
        getDeviceId(),
        (adUnitId) => wechatAdapter.createRewardedVideoAd(adUnitId)
      );
      result = await runRewardFlow(this.rewardDependencies);
    }
    if (result.status === "completed") {
      this.pendingRewardConfirmation = null;
      this.rewardDependencies = null;
      this.applyEntitlement(result.entitlement);
      trackFunnelEvent("entitlement_credited", { dramaId: this.data.drama.id });
      const episode = this.data.unlockEpisode;
      this.setData({
        unlockVisible: false,
        rewardLoading: false,
        rewardRetryPending: false
      });
      wx.showToast({ title: "已获得观看时长", icon: "success" });
      if (episode) this.openPlayer(episode);
      return;
    }
    if (result.status === "confirmation_pending") {
      this.pendingRewardConfirmation = result.pending;
      this.setData({
        rewardLoading: false,
        rewardRetryPending: true,
        rewardError: describeRewardResult(result)
      });
      return;
    }
    this.pendingRewardConfirmation = null;
    this.rewardDependencies = null;
    this.setData({
      rewardLoading: false,
      rewardRetryPending: false,
      rewardError: describeRewardResult(result)
    });
    trackFunnelEvent("ad_fail", { dramaId: this.data.drama?.id, status: result.status });
  },

  onShareAppMessage() {
    const card = buildDramaShareCard({ isMock: this.data.isMock, drama: this.data.drama });
    if (!card) return { title: "内部体验不可外传" };
    return card;
  },

  episodeIsFree(event: WechatMiniprogram.TouchEvent) {
    return isFreeEpisode(Number(event.currentTarget.dataset.number));
  }
});
