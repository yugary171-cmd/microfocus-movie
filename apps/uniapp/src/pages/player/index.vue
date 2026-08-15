<script setup lang="ts">
import { HEARTBEAT_INTERVAL_SECONDS, isPlaybackRatePreset, OFFLINE_GRACE_SECONDS, PLAYBACK_RATE_DEFAULT, PLAYBACK_RATES, type PlaybackLeaseView } from "@microfocus/contracts";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { computed, nextTick, ref } from "vue";
import CommentSheet from "../../components/comment-sheet/index.vue";
import PlayerActions from "../../components/player-actions/index.vue";
import {
  createVideoContext,
  getNetworkType,
  offNetworkStatusChange,
  onNetworkStatusChange
} from "../../platform/media";
import { getApi, isMockMode } from "../../services/api";
import { restoreOrCreatePlaybackLease } from "../../services/playback-session";
import { PlaybackHeartbeatController } from "../../services/playback-controller";
import { getDeviceId } from "../../utils/device";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { episodeDurationsFromDrama, formatApproximateRemainingEpisodes } from "../../utils/format";
import { formatEngagementCount, shareDramaText, shareIfExternallyAllowed } from "../../utils/engagement";

const isMock = isMockMode();
const dramaId = ref("");
const episodeId = ref("");
const dramaTitle = ref("");
const episodeNumber = ref(0);
const loading = ref(true);
const error = ref("");
const notice = ref("");
const playbackUrl = ref("");
const hasPlaybackUrl = ref(false);
const lease = ref<PlaybackLeaseView | null>(null);
const remainingLabel = ref("免费集");
let episodeDurations: number[] = [];
const playbackRate = ref(PLAYBACK_RATE_DEFAULT);
const rates = PLAYBACK_RATES;
const currentPosition = ref(0);
const started = ref(false);
const commentsOpen = ref(false);
const isFavorite = ref(false);
const isLiked = ref(false);
const favoriteCount = ref(1288);
const commentCount = ref(349);
const likeCount = ref(9712);
const favoriteLabel = computed(() => formatEngagementCount(favoriteCount.value));
const commentLabel = computed(() => formatEngagementCount(commentCount.value));
const likeLabel = computed(() => formatEngagementCount(likeCount.value));

let controller: PlaybackHeartbeatController | null = null;
let heartbeatTimer = 0;
let offlineTimer = 0;
let renewTimer = 0;
let videoContext: UniApp.VideoContext | null = null;
let networkListener: ((result: UniApp.OnNetworkStatusChangeSuccess) => void) | null = null;
let closingLeaseId = "";
let pageVisible = true;
let networkAvailable = true;

function clearTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (offlineTimer) clearInterval(offlineTimer);
  if (renewTimer) clearTimeout(renewTimer);
  heartbeatTimer = 0;
  offlineTimer = 0;
  renewTimer = 0;
}

function remainingFromLease(isFree: boolean, remainingSeconds: number | null | undefined): string {
  if (isFree) return "免费集";
  return formatApproximateRemainingEpisodes(remainingSeconds, episodeDurations);
}

function getStopReason(reason?: string) {
  if (reason === "ENTITLEMENT_EXHAUSTED") return "本剧观看时长已用完，已暂停并保留当前位置";
  if (reason === "DRAMA_OFFLINE") return "本剧暂时下线，已暂停并保留当前位置";
  if (reason === "UNCONFIRMED_EXPOSURE") return "有未确认播放窗口，需恢复后继续；未确认窗口不会自动扣费";
  return "播放授权已结束，已暂停并保留当前位置";
}

async function persistProgress() {
  if (!dramaId.value || !episodeId.value) return;
  await getApi()
    .saveProgress({
      dramaId: dramaId.value,
      episodeId: episodeId.value,
      mediaPositionSeconds: Math.max(0, currentPosition.value)
    })
    .catch(() => undefined);
}

function checkOfflineGrace() {
  if (!controller?.shouldPauseForOffline(Date.now(), OFFLINE_GRACE_SECONDS)) return;
  videoContext?.pause();
  controller.setState("paused");
  notice.value = "网络中断超过 15 秒，已暂停并保留当前位置";
}

async function sendHeartbeat() {
  const currentLease = lease.value;
  const currentController = controller;
  if (!currentLease || !currentController) return;
  const result = await currentController.tick((heartbeat) =>
    getApi().heartbeat(currentLease.id, {
      ...heartbeat,
      ...(currentLease.currentWindow?.id ? { windowId: currentLease.currentWindow.id } : {})
    })
  );
  if (
    result.status === "idle" ||
    result.status === "stale" ||
    !pageVisible ||
    controller !== currentController ||
    lease.value?.id !== currentLease.id
  ) {
    return;
  }
  if (result.status === "failed") {
    notice.value = `播放状态同步失败，将重试同一进度：${toFriendlyErrorMessage(result.error)}`;
    return;
  }
  if (result.status !== "confirmed") return;
  const response = result.response;
  if (typeof response.remainingSeconds === "number") {
    remainingLabel.value = remainingFromLease(Boolean(currentLease.isFree), response.remainingSeconds);
  }
  if (!response.mayContinue) {
    videoContext?.pause();
    currentController.setState("paused");
    notice.value = getStopReason(response.reason);
    void persistProgress();
  }
}

function startTimers(intervalSeconds: number) {
  clearTimers();
  heartbeatTimer = setInterval(
    () => void sendHeartbeat(),
    Math.max(1, intervalSeconds) * 1000
  ) as unknown as number;
  offlineTimer = setInterval(() => checkOfflineGrace(), 1000) as unknown as number;
}

async function renewLease() {
  const currentLease = lease.value;
  if (!currentLease || !pageVisible) return;
  try {
    const renewed = await getApi().renewPlaybackLease(currentLease.id);
    applyLease(renewed, true);
    notice.value = "播放凭证已续期";
  } catch (caught) {
    const expired = Date.now() >= new Date(currentLease.playbackTokenExpiresAt).getTime();
    notice.value = `播放凭证续期失败：${toFriendlyErrorMessage(caught)}`;
    if (expired) {
      videoContext?.pause();
      controller?.setState("paused");
    } else {
      renewTimer = setTimeout(() => void renewLease(), 5_000) as unknown as number;
    }
  }
}

function scheduleRenewal(current: PlaybackLeaseView) {
  if (renewTimer) clearTimeout(renewTimer);
  const expiresAt = new Date(current.playbackTokenExpiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return;
  const waitMs = Math.max(5_000, expiresAt - Date.now() - 30_000);
  renewTimer = setTimeout(() => void renewLease(), waitMs) as unknown as number;
}

function applyLease(current: PlaybackLeaseView, restorePosition = false) {
  lease.value = current;
  playbackUrl.value = current.playbackUrl || "";
  hasPlaybackUrl.value = Boolean(current.playbackUrl);
  remainingLabel.value = remainingFromLease(current.isFree, current.remainingSeconds);
  scheduleRenewal(current);
  if (restorePosition && currentPosition.value > 0) {
    void nextTick(() => videoContext?.seek(currentPosition.value));
  }
}

function setupNetworkMonitoring() {
  networkListener = ({ isConnected }) => {
    networkAvailable = isConnected;
    controller?.setNetworkAvailable(isConnected);
    notice.value = isConnected ? "网络已恢复" : `网络中断，${OFFLINE_GRACE_SECONDS} 秒后将暂停`;
  };
  onNetworkStatusChange(networkListener);
  void getNetworkType().then((networkType) => {
    networkAvailable = networkType !== "none";
    controller?.setNetworkAvailable(networkAvailable);
  });
}

function suspendAndClose() {
  videoContext?.pause();
  controller?.stop();
  clearTimers();
  void persistProgress();
  const currentLease = lease.value;
  lease.value = null;
  controller = null;
  if (!currentLease || closingLeaseId === currentLease.id) return;
  closingLeaseId = currentLease.id;
  void getApi()
    .closePlaybackLease(currentLease.id)
    .catch(() => undefined)
    .finally(() => {
      if (closingLeaseId === currentLease.id) closingLeaseId = "";
    });
}

async function openLease() {
  if (lease.value || (loading.value && started.value)) return;
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const [created, detail] = await Promise.all([
      restoreOrCreatePlaybackLease(episodeId.value, getDeviceId()),
      getApi().getDrama(dramaId.value).catch(() => null)
    ]);
    episodeDurations = episodeDurationsFromDrama(detail);
    if (!pageVisible) {
      void getApi().closePlaybackLease(created.id).catch(() => undefined);
      return;
    }
    controller = new PlaybackHeartbeatController();
    controller.setInitialPosition(currentPosition.value);
    controller.setNetworkAvailable(networkAvailable);
    started.value = true;
    startTimers(created.heartbeatIntervalSeconds || HEARTBEAT_INTERVAL_SECONDS);
    applyLease(created);
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    lease.value = null;
    playbackUrl.value = "";
    hasPlaybackUrl.value = false;
  } finally {
    loading.value = false;
  }
}

function onPlay() {
  controller?.setState("playing");
  notice.value = "";
}

function onPause() {
  controller?.setState("paused");
  void persistProgress();
}

function onWaiting() {
  controller?.setState("buffering");
}

function onEnded() {
  controller?.setState("paused");
  void persistProgress();
}

function onTimeUpdate(event: Event) {
  const position = Number((event as unknown as { detail?: { currentTime?: number } }).detail?.currentTime) || 0;
  controller?.setPosition(position);
  currentPosition.value = position;
}

function onVideoError(event: Event) {
  controller?.setState("paused");
  notice.value =
    (event as unknown as { detail?: { errMsg?: string } }).detail?.errMsg || "视频加载失败";
}

function onVideoReady() {
  if (currentPosition.value > 0) videoContext?.seek(currentPosition.value);
}

function changeRate(rate: number) {
  if (!isPlaybackRatePreset(rate)) return;
  videoContext?.playbackRate(rate);
  controller?.setPlaybackRate(rate);
  playbackRate.value = rate;
}

function goBack() {
  uni.navigateBack();
}

function toggleFavorite() {
  isFavorite.value = !isFavorite.value;
  favoriteCount.value += isFavorite.value ? 1 : -1;
  uni.showToast({ title: isFavorite.value ? "已收藏到我的片单" : "已取消收藏", icon: "none" });
}

function toggleLike() {
  isLiked.value = !isLiked.value;
  likeCount.value += isLiked.value ? 1 : -1;
  uni.showToast({ title: isLiked.value ? "已点赞" : "已取消点赞", icon: "none" });
}

function shareCurrent() {
  shareIfExternallyAllowed(
    shareDramaText(dramaTitle.value, `第${episodeNumber.value}集`),
    !isMock
  );
}

onLoad((options) => {
  dramaId.value = options?.dramaId ? decodeURIComponent(options.dramaId) : "";
  episodeId.value = options?.episodeId ? decodeURIComponent(options.episodeId) : "";
  dramaTitle.value = options?.title ? decodeURIComponent(options.title) : "短剧";
  episodeNumber.value = Number(options?.episodeNumber) || 0;
  currentPosition.value = Math.max(0, Number(options?.position) || 0);
  if (!dramaId.value || !episodeId.value) {
    loading.value = false;
    error.value = "缺少播放参数";
    return;
  }
  uni.setNavigationBarTitle({ title: `${dramaTitle.value} · 第${episodeNumber.value}集` });
  videoContext = createVideoContext("player");
  setupNetworkMonitoring();
  void openLease();
});

onShow(() => {
  pageVisible = true;
  if (started.value && !lease.value && episodeId.value) void openLease();
});

onHide(() => {
  pageVisible = false;
  suspendAndClose();
});

onUnload(() => {
  pageVisible = false;
  suspendAndClose();
  if (networkListener) offNetworkStatusChange(networkListener);
  networkListener = null;
});
</script>

<template>
  <view class="player-page">
    <view class="topbar">
      <button class="back" aria-label="返回短剧详情" @tap="goBack">‹</button>
      <view class="heading">
        <view class="drama-title">{{ dramaTitle }}</view>
        <view class="episode-title">第 {{ episodeNumber }} 集</view>
      </view>
      <view class="remaining" :aria-label="`剩余 ${remainingLabel}，仅本剧有效`">{{ remainingLabel }}</view>
    </view>

    <internal-banner :visible="isMock" />
    <view class="stage">
      <view v-if="loading" class="player-state" role="status">正在获取播放授权…</view>
      <view v-else-if="error" class="player-state" role="alert">
        <view class="state-title">无法开始播放</view>
        <view>{{ error }}</view>
        <button class="secondary-button retry" @tap="openLease">重新获取授权</button>
      </view>
      <view v-else-if="!hasPlaybackUrl" class="player-state configuration" role="status">
        <view class="state-title">尚未配置可播放视频</view>
        <view>服务端已返回播放授权，但没有视频地址。请先配置真实 VOD 播放地址。</view>
      </view>
      <video
        v-else
        id="player"
        class="video"
        :src="playbackUrl"
        autoplay
        :muted="false"
        :obey-mute-switch="false"
        controls
        show-center-play-btn
        enable-progress-gesture
        :custom-cache="false"
        object-fit="contain"
        :aria-label="`${dramaTitle}第${episodeNumber}集播放器`"
        @play="onPlay"
        @pause="onPause"
        @waiting="onWaiting"
        @ended="onEnded"
        @timeupdate="onTimeUpdate"
        @error="onVideoError"
        @loadedmetadata="onVideoReady"
      />
      <PlayerActions
        class="stage-actions"
        :favorited="isFavorite"
        :liked="isLiked"
        :favorite-label="favoriteLabel"
        :comment-label="commentLabel"
        :like-label="likeLabel"
        share-label="分享"
        @favorite="toggleFavorite"
        @comment="commentsOpen = true"
        @like="toggleLike"
        @share="shareCurrent"
      />
    </view>

    <view v-if="notice" class="notice" role="status">{{ notice }}</view>
    <view class="controls" aria-label="播放速度">
      <view class="control-label">倍速</view>
      <button
        v-for="item in rates"
        :key="item"
        class="rate"
        :class="{ active: playbackRate === item }"
        :aria-pressed="playbackRate === item"
        @tap="changeRate(item)"
      >
        {{ item }}x
      </button>
    </view>
    <view class="tip">仅在实际播放时每 5 秒同步一次进度；暂停、缓冲或进入后台不会发送扣减心跳。</view>
    <CommentSheet
      :visible="commentsOpen"
      :drama-title="dramaTitle"
      @close="commentsOpen = false"
    />
  </view>
</template>

<style scoped src="../../styles/player.scss"></style>
