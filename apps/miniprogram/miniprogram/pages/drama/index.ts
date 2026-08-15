import type { DramaDetail, EntitlementSummary, EpisodeSummary } from "@microfocus/contracts";
import { getApi, isMockMode } from "../../services/api";
import {
  createRewardDependencies,
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
import {
  ENTITLEMENT_INCOMPLETE_AD_LABEL,
  ENTITLEMENT_SCOPE_LABEL,
  episodeDurationsFromDrama,
  formatApproximateRemainingEpisodes,
  formatDateTime,
  formatRewardUnlockCopy
} from "../../utils/format";

Page({
  data: {
    id: "",
    isMock: isMockMode(),
    loading: true,
    error: "",
    drama: null as DramaDetail | null,
    entitlement: null as EntitlementSummary | null,
    remainingLabel: "约 0 集",
    expiryLabel: "暂无到期时间",
    scopeLabel: ENTITLEMENT_SCOPE_LABEL,
    incompleteAdLabel: ENTITLEMENT_INCOMPLETE_AD_LABEL,
    unlockCopy: formatRewardUnlockCopy("", []),
    unlockVisible: false,
    unlockEpisode: null as EpisodeSummary | null,
    rewardLoading: false,
    rewardError: "",
    rewardRetryPending: false
  },

  rewardDependencies: null as RewardFlowDependencies | null,
  pendingRewardConfirmation: null as PendingRewardConfirmation | null,

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ? decodeURIComponent(options.id) : "";
    this.setData({ id });
    if (!id) {
      this.setData({ loading: false, error: "缺少短剧编号" });
      return;
    }
    void this.loadDetail();
  },

  onShow() {
    if (this.data.id && this.data.drama) void this.loadEntitlement();
  },

  async loadDetail() {
    this.setData({ loading: true, error: "" });
    try {
      const [drama, entitlement] = await Promise.all([
        getApi().getDrama(this.data.id),
        getApi().getEntitlement(this.data.id).catch(() => null)
      ]);
      this.setData({ drama });
      this.applyEntitlement(entitlement);
      wx.setNavigationBarTitle({ title: drama.title || "短剧详情" });
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), drama: null });
    } finally {
      this.setData({ loading: false });
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
      remainingLabel: formatApproximateRemainingEpisodes(entitlement?.remainingSeconds, durations),
      expiryLabel: formatDateTime(entitlement?.nearestExpiresAt),
      unlockCopy: formatRewardUnlockCopy(this.data.drama?.title ?? "", durations)
    });
  },

  selectEpisode(event: WechatMiniprogram.TouchEvent) {
    const episodeId = String(event.currentTarget.dataset.id || "");
    const episode = this.data.drama?.episodes.find((item) => item.id === episodeId);
    if (!episode || !this.data.drama) return;
    const remaining = this.data.entitlement?.remainingSeconds ?? 0;
    if (!canStartEpisode(episode.episodeNumber, remaining)) {
      this.setData({ unlockVisible: true, unlockEpisode: episode, rewardError: "" });
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
        rewardError: "奖励确认中，可重试。再次点击不会创建新广告任务。"
      });
      return;
    }
    this.pendingRewardConfirmation = null;
    this.rewardDependencies = null;
    this.setData({
      rewardLoading: false,
      rewardRetryPending: false,
      rewardError:
        result.status === "incomplete"
          ? "广告未完整播放，本次未发放观看时长。你可以重试。"
          : toFriendlyErrorMessage(result.error)
    });
  },

  episodeIsFree(event: WechatMiniprogram.TouchEvent) {
    return isFreeEpisode(Number(event.currentTarget.dataset.number));
  }
});
