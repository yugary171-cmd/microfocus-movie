import {
  isPlaybackRatePreset,
  PLAYBACK_RATE_DEFAULT,
  PLAYBACK_RATES,
  type PlaybackLeaseView
} from "@microfocus/contracts";
import {
  HEARTBEAT_INTERVAL_SECONDS,
  OFFLINE_GRACE_SECONDS
} from "../../constants/runtime";
import { getApi, isMockMode } from "../../services/api";
import { PlaybackHeartbeatController } from "../../services/playback-controller";
import { restoreOrCreatePlaybackLease } from "../../services/playback-session";
import { getDeviceId } from "../../utils/device";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { formatRemainingTime } from "../../utils/format";

Page({
  data: {
    isMock: isMockMode(),
    dramaId: "",
    episodeId: "",
    dramaTitle: "",
    episodeNumber: 0,
    loading: true,
    error: "",
    notice: "",
    playbackUrl: "",
    hasPlaybackUrl: false,
    lease: null as PlaybackLeaseView | null,
    remainingLabel: "免费集",
    playbackRate: PLAYBACK_RATE_DEFAULT,
    rates: PLAYBACK_RATES,
    currentPosition: 0,
    started: false
  },

  controller: null as PlaybackHeartbeatController | null,
  heartbeatTimer: 0 as number,
  offlineTimer: 0 as number,
  renewTimer: 0 as number,
  videoContext: null as WechatMiniprogram.VideoContext | null,
  networkListener: null as ((result: WechatMiniprogram.OnNetworkStatusChangeListenerResult) => void) | null,
  closingLeaseId: "",
  pageVisible: true,
  networkAvailable: true,

  onLoad(options: Record<string, string | undefined>) {
    const dramaId = options.dramaId ? decodeURIComponent(options.dramaId) : "";
    const episodeId = options.episodeId ? decodeURIComponent(options.episodeId) : "";
    const dramaTitle = options.title ? decodeURIComponent(options.title) : "短剧";
    const episodeNumber = Number(options.episodeNumber) || 0;
    const currentPosition = Math.max(0, Number(options.position) || 0);
    this.setData({ dramaId, episodeId, dramaTitle, episodeNumber, currentPosition });
    if (!dramaId || !episodeId) {
      this.setData({ loading: false, error: "缺少播放参数" });
      return;
    }
    wx.setNavigationBarTitle({ title: `${dramaTitle} · 第${episodeNumber}集` });
    this.videoContext = wx.createVideoContext("player", this);
    this.setupNetworkMonitoring();
    void this.openLease();
  },

  onShow() {
    this.pageVisible = true;
    if (this.data.started && !this.data.lease && this.data.episodeId) void this.openLease();
  },

  onHide() {
    this.pageVisible = false;
    this.suspendAndClose();
  },

  onUnload() {
    this.pageVisible = false;
    this.suspendAndClose();
    if (this.networkListener) {
      // The published mini-program typings model the on/off callback parameters
      // differently even though the runtime requires the same listener reference.
      wx.offNetworkStatusChange(this.networkListener as never);
    }
    this.networkListener = null;
  },

  async openLease() {
    if (this.data.lease || this.data.loading && this.data.started) return;
    this.setData({ loading: true, error: "", notice: "" });
    try {
      const lease = await restoreOrCreatePlaybackLease(this.data.episodeId, getDeviceId());
      if (!this.pageVisible) {
        void getApi().closePlaybackLease(lease.id).catch(() => undefined);
        return;
      }
      this.controller = new PlaybackHeartbeatController();
      this.controller.setInitialPosition(this.data.currentPosition);
      this.controller.setNetworkAvailable(this.networkAvailable);
      this.setData({ started: true });
      this.startTimers(lease.heartbeatIntervalSeconds || HEARTBEAT_INTERVAL_SECONDS);
      this.applyLease(lease);
    } catch (error) {
      this.setData({ error: toFriendlyErrorMessage(error), lease: null, playbackUrl: "", hasPlaybackUrl: false });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyLease(lease: PlaybackLeaseView, restorePosition = false) {
    this.setData({
      lease,
      playbackUrl: lease.playbackUrl || "",
      hasPlaybackUrl: Boolean(lease.playbackUrl),
      remainingLabel: lease.isFree ? "免费集" : formatRemainingTime(lease.remainingSeconds)
    });
    this.scheduleRenewal(lease);
    if (restorePosition && this.data.currentPosition > 0) {
      wx.nextTick(() => this.videoContext?.seek(this.data.currentPosition));
    }
  },

  startTimers(intervalSeconds: number) {
    this.clearTimers();
    this.heartbeatTimer = setInterval(
      () => void this.sendHeartbeat(),
      Math.max(1, intervalSeconds) * 1000
    ) as unknown as number;
    this.offlineTimer = setInterval(() => this.checkOfflineGrace(), 1000) as unknown as number;
  },

  clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.offlineTimer) clearInterval(this.offlineTimer);
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.heartbeatTimer = 0;
    this.offlineTimer = 0;
    this.renewTimer = 0;
  },

  setupNetworkMonitoring() {
    this.networkListener = ({ isConnected }) => {
      this.networkAvailable = isConnected;
      this.controller?.setNetworkAvailable(isConnected);
      this.setData({ notice: isConnected ? "网络已恢复" : `网络中断，${OFFLINE_GRACE_SECONDS} 秒后将暂停` });
    };
    wx.onNetworkStatusChange(this.networkListener);
    wx.getNetworkType({
      success: ({ networkType }) => {
        this.networkAvailable = networkType !== "none";
        this.controller?.setNetworkAvailable(this.networkAvailable);
      }
    });
  },

  checkOfflineGrace() {
    if (!this.controller?.shouldPauseForOffline(Date.now(), OFFLINE_GRACE_SECONDS)) return;
    this.videoContext?.pause();
    this.controller.setState("paused");
    this.setData({ notice: "网络中断超过 15 秒，已暂停并保留当前位置" });
  },

  async sendHeartbeat() {
    const lease = this.data.lease;
    const controller = this.controller;
    if (!lease || !controller) return;
    const result = await controller.tick((heartbeat) =>
      getApi().heartbeat(lease.id, {
        ...heartbeat,
        ...(lease.currentWindow?.id ? { windowId: lease.currentWindow.id } : {})
      })
    );
    if (
      result.status === "idle" ||
      result.status === "stale" ||
      !this.pageVisible ||
      this.controller !== controller ||
      this.data.lease?.id !== lease.id
    ) {
      return;
    }
    if (result.status === "failed") {
      this.setData({
        notice: `播放状态同步失败，将重试同一进度：${toFriendlyErrorMessage(result.error)}`
      });
      return;
    }
    if (result.status !== "confirmed") return;
    const response = result.response;
    if (typeof response.remainingSeconds === "number") {
      this.setData({ remainingLabel: formatRemainingTime(response.remainingSeconds) });
    }
    if (!response.mayContinue) {
      this.videoContext?.pause();
      controller.setState("paused");
      this.setData({ notice: this.getStopReason(response.reason) });
      void this.persistProgress();
    }
  },

  getStopReason(reason?: string) {
    if (reason === "ENTITLEMENT_EXHAUSTED") return "本剧观看时长已用完，已暂停并保留当前位置";
    if (reason === "DRAMA_OFFLINE") return "本剧暂时下线，已暂停并保留当前位置";
    if (reason === "UNCONFIRMED_EXPOSURE") return "有未确认播放窗口，需恢复后继续；未确认窗口不会自动扣费";
    return "播放授权已结束，已暂停并保留当前位置";
  },

  scheduleRenewal(lease: PlaybackLeaseView) {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    const expiresAt = new Date(lease.playbackTokenExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const waitMs = Math.max(5_000, expiresAt - Date.now() - 30_000);
    this.renewTimer = setTimeout(() => void this.renewLease(), waitMs) as unknown as number;
  },

  async renewLease() {
    const lease = this.data.lease;
    if (!lease || !this.pageVisible) return;
    try {
      const renewed = await getApi().renewPlaybackLease(lease.id);
      this.applyLease(renewed, true);
      this.setData({ notice: "播放凭证已续期" });
    } catch (error) {
      const expired = Date.now() >= new Date(lease.playbackTokenExpiresAt).getTime();
      this.setData({ notice: `播放凭证续期失败：${toFriendlyErrorMessage(error)}` });
      if (expired) {
        this.videoContext?.pause();
        this.controller?.setState("paused");
      } else {
        this.renewTimer = setTimeout(() => void this.renewLease(), 5_000) as unknown as number;
      }
    }
  },

  onPlay() {
    this.controller?.setState("playing");
    this.setData({ notice: "" });
  },

  onPause() {
    this.controller?.setState("paused");
    void this.persistProgress();
  },

  onWaiting() {
    this.controller?.setState("buffering");
  },

  onEnded() {
    this.controller?.setState("paused");
    void this.persistProgress();
  },

  onTimeUpdate(event: WechatMiniprogram.VideoTimeUpdate) {
    const position = event.detail.currentTime || 0;
    this.controller?.setPosition(position);
    this.setData({ currentPosition: position });
  },

  onVideoError(event: WechatMiniprogram.VideoError) {
    this.controller?.setState("paused");
    const message = event.detail?.errMsg || "视频加载失败";
    this.setData({ notice: message });
  },

  onVideoReady() {
    if (this.data.currentPosition > 0) {
      this.videoContext?.seek(this.data.currentPosition);
    }
  },

  changeRate(event: WechatMiniprogram.TouchEvent) {
    const rate = Number(event.currentTarget.dataset.rate);
    if (!isPlaybackRatePreset(rate)) return;
    this.videoContext?.playbackRate(rate);
    this.controller?.setPlaybackRate(rate);
    this.setData({ playbackRate: rate });
  },

  async persistProgress() {
    if (!this.data.dramaId || !this.data.episodeId) return;
    await getApi().saveProgress({
      dramaId: this.data.dramaId,
      episodeId: this.data.episodeId,
      mediaPositionSeconds: Math.max(0, this.data.currentPosition)
    }).catch(() => undefined);
  },

  suspendAndClose() {
    this.videoContext?.pause();
    this.controller?.stop();
    this.clearTimers();
    void this.persistProgress();
    const lease = this.data.lease;
    this.setData({ lease: null });
    this.controller = null;
    if (!lease || this.closingLeaseId === lease.id) return;
    this.closingLeaseId = lease.id;
    void getApi()
      .closePlaybackLease(lease.id)
      .catch(() => undefined)
      .finally(() => {
        if (this.closingLeaseId === lease.id) this.closingLeaseId = "";
      });
  },

  goBack() {
    wx.navigateBack();
  }
});
