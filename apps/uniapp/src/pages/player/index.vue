<script setup lang="ts">
import { HEARTBEAT_INTERVAL_SECONDS, isPlaybackRatePreset, OFFLINE_GRACE_SECONDS, PLAYBACK_RATE_DEFAULT, PLAYBACK_RATES, type DramaDetail, type EpisodeSummary, type PlaybackLeaseView } from "@microfocus/contracts";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { computed, nextTick, ref } from "vue";
import { createRewardedVideoAd } from "../../platform/ads";
import CommentSheet from "../../components/comment-sheet/index.vue";
import PlayerActions from "../../components/player-actions/index.vue";
import RewardUnlockSheet from "../../components/reward-unlock-sheet/index.vue";
import {
  createVideoContext,
  getNetworkType,
  offNetworkStatusChange,
  onNetworkStatusChange
} from "../../platform/media";
import { ensureSession, getApi, getStoredSession, isMockMode } from "../../services/api";
import {
  createRewardDependencies,
  describeRewardResult,
  retryRewardConfirmation,
  runRewardFlow,
  type PendingRewardConfirmation,
  type RewardFlowDependencies,
  type RewardResult
} from "../../services/reward";
import { dramaInLibraryPages, setDramaLibraryFlag } from "../../services/library";
import { restoreOrCreatePlaybackLease } from "../../services/playback-session";
import { PlaybackHeartbeatController } from "../../services/playback-controller";
import { getDeviceId } from "../../utils/device";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { episodeDurationsFromDrama, formatApproximateRemainingEpisodes } from "../../utils/format";
import { canStartEpisode } from "../../utils/episode";
import { formatEngagementCount, shareDramaText, shareIfExternallyAllowed } from "../../utils/engagement";
import { FAVORITE_TAB, LIKE_TAB } from "../../utils/inbox-view";
import { holdBoostRate, restoreHoldRate } from "../../utils/playback-gesture";

const isMock = isMockMode();
const dramaId = ref("");
const episodeId = ref("");
const dramaTitle = ref("");
const episodeNumber = ref(0);
const drama = ref<DramaDetail | null>(null);
const loading = ref(true);
const statusBarInset = ref(20);
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
const durationSeconds = ref(0);
const started = ref(false);
const isPlaying = ref(false);
const holdBoosting = ref(false);
const speedDrawerOpen = ref(false);
const episodeDrawerOpen = ref(false);
const activeEpisodeRange = ref(0);
const unlockVisible = ref(false);
const unlockEpisode = ref<EpisodeSummary | null>(null);
const entitlement = ref<{ remainingSeconds?: number | null } | null>(null);
const unlockCopy = ref("");
const rewardLoading = ref(false);
const loginLoading = ref(false);
const rewardError = ref("");
const rewardRetryPending = ref(false);
const commentsOpen = ref(false);
const isFavorite = ref(false);
const isLiked = ref(false);
const favoriteCount = ref(1288);
const commentCount = ref(349);
const likeCount = ref(9712);
const favoriteLabel = computed(() => formatEngagementCount(favoriteCount.value));
const commentLabel = computed(() => formatEngagementCount(commentCount.value));
const likeLabel = computed(() => formatEngagementCount(likeCount.value));
const progressPercent = computed(() => {
  if (!durationSeconds.value) return 0;
  return Math.min(100, Math.max(0, (currentPosition.value / durationSeconds.value) * 100));
});

let controller: PlaybackHeartbeatController | null = null;
let heartbeatTimer = 0;
let offlineTimer = 0;
let renewTimer = 0;
let videoContext: UniApp.VideoContext | null = null;
let networkListener: ((result: UniApp.OnNetworkStatusChangeSuccess) => void) | null = null;
let closingLeaseId = "";
let pageVisible = true;
let networkAvailable = true;
let suppressTap = false;
let holdRestoreRate = PLAYBACK_RATE_DEFAULT;
let rewardDependencies: RewardFlowDependencies | null = null;
let pendingRewardConfirmation: PendingRewardConfirmation | null = null;

function decodeRouteValue(value?: string): string {
  let decoded = String(value || "");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

const displayRates = [...rates].reverse();
const episodeRanges = computed(() => {
  const episodes = Array.isArray(drama.value?.episodes) ? drama.value.episodes : [];
  const ranges: Array<{ label: string; episodes: EpisodeSummary[] }> = [];
  for (let index = 0; index < episodes.length; index += 30) {
    const chunk = episodes.slice(index, index + 30);
    const first = chunk[0]?.episodeNumber || index + 1;
    const last = chunk[chunk.length - 1]?.episodeNumber || first;
    ranges.push({ label: `${first}-${last}`, episodes: chunk });
  }
  return ranges;
});

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
  if (hasPlaybackUrl.value) isPlaying.value = true;
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
  endHoldBoost();
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
    drama.value = detail;
    episodeDurations = episodeDurationsFromDrama(detail);
    unlockCopy.value = detail?.title ? `${detail.title}当前可用观看时长。` : "";
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
    void hydrateLibraryFlags();
    void loadEntitlement();
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    lease.value = null;
    playbackUrl.value = "";
    hasPlaybackUrl.value = false;
  } finally {
    loading.value = false;
  }
}

async function loadEntitlement() {
  if (!dramaId.value) return;
  try {
    entitlement.value = await getApi().getEntitlement(dramaId.value);
    unlockCopy.value = drama.value?.title ? `${drama.value.title}当前可用观看时长。` : "";
  } catch {
    entitlement.value = null;
  }
}

function selectEpisodeRange(index: number) {
  if (index < 0 || index >= episodeRanges.value.length) return;
  activeEpisodeRange.value = index;
}

function openEpisodeDrawer() {
  const currentIndex = episodeRanges.value.findIndex((range) =>
    range.episodes.some((item) => item.id === episodeId.value)
  );
  activeEpisodeRange.value = currentIndex >= 0 ? currentIndex : 0;
  episodeDrawerOpen.value = true;
  speedDrawerOpen.value = false;
}

function openSpeedDrawer() {
  speedDrawerOpen.value = true;
  episodeDrawerOpen.value = false;
}

function closeDrawers() {
  speedDrawerOpen.value = false;
  episodeDrawerOpen.value = false;
}

function goToDrama() {
  if (!dramaId.value) return;
  uni.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(dramaId.value)}` });
}

async function loginForLockedEpisode(): Promise<boolean> {
  if (loginLoading.value) return false;
  loginLoading.value = true;
  try {
    const session = await ensureSession();
    await loadEntitlement();
    return Boolean(getStoredSession() ?? session);
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
    return false;
  } finally {
    loginLoading.value = false;
  }
}

function stopCurrentLease() {
  suspendAndClose();
  started.value = false;
  lease.value = null;
  playbackUrl.value = "";
  hasPlaybackUrl.value = false;
  isPlaying.value = false;
}

async function startEpisode(episode: EpisodeSummary) {
  if (episode.id === episodeId.value && lease.value) {
    closeDrawers();
    return;
  }
  stopCurrentLease();
  episodeId.value = episode.id;
  episodeNumber.value = episode.episodeNumber;
  currentPosition.value = 0;
  durationSeconds.value = 0;
  error.value = "";
  notice.value = "";
  closeDrawers();
  await openLease();
}

async function selectEpisode(episode: EpisodeSummary) {
  if (!drama.value || !episode) return;
  const remaining = entitlement.value?.remainingSeconds ?? 0;
  if (!canStartEpisode(episode.episodeNumber, remaining)) {
    if (!getStoredSession() && !(await loginForLockedEpisode())) return;
    const refreshedRemaining = entitlement.value?.remainingSeconds ?? 0;
    if (!canStartEpisode(episode.episodeNumber, refreshedRemaining)) {
      unlockEpisode.value = episode;
      unlockVisible.value = true;
      rewardError.value = "";
      closeDrawers();
      return;
    }
  }
  await startEpisode(episode);
}

function closeUnlock() {
  if (!rewardLoading.value) unlockVisible.value = false;
}

async function watchRewardAd() {
  if (rewardLoading.value || !drama.value || !unlockEpisode.value) return;
  rewardLoading.value = true;
  rewardError.value = "";
  let result: RewardResult;
  if (pendingRewardConfirmation && rewardDependencies) {
    result = await retryRewardConfirmation(rewardDependencies, pendingRewardConfirmation);
  } else {
    rewardDependencies = createRewardDependencies(
      getApi(),
      drama.value.id,
      getDeviceId(),
      (adUnitId) => createRewardedVideoAd(adUnitId)
    );
    result = await runRewardFlow(rewardDependencies);
  }
  if (result.status === "completed") {
    pendingRewardConfirmation = null;
    rewardDependencies = null;
    entitlement.value = result.entitlement;
    const target = unlockEpisode.value;
    unlockVisible.value = false;
    rewardLoading.value = false;
    rewardRetryPending.value = false;
    uni.showToast({ title: "已获得观看时长", icon: "success" });
    await startEpisode(target);
    return;
  }
  if (result.status === "confirmation_pending") {
    pendingRewardConfirmation = result.pending;
    rewardLoading.value = false;
    rewardRetryPending.value = true;
    rewardError.value = describeRewardResult(result);
    return;
  }
  pendingRewardConfirmation = null;
  rewardDependencies = null;
  rewardLoading.value = false;
  rewardRetryPending.value = false;
  rewardError.value = describeRewardResult(result);
}

function onPlay() {
  controller?.setState("playing");
  isPlaying.value = true;
  notice.value = "";
}

function onPause() {
  controller?.setState("paused");
  isPlaying.value = false;
  endHoldBoost();
  void persistProgress();
}

function onWaiting() {
  controller?.setState("buffering");
}

function onEnded() {
  controller?.setState("paused");
  isPlaying.value = false;
  endHoldBoost();
  void persistProgress();
}

function onTimeUpdate(event: Event) {
  const detail = (event as unknown as { detail?: { currentTime?: number; duration?: number } }).detail;
  const position = Number(detail?.currentTime) || 0;
  const duration = Number(detail?.duration) || 0;
  if (duration > 0) durationSeconds.value = duration;
  controller?.setPosition(position);
  currentPosition.value = position;
}

function onVideoError(event: Event) {
  controller?.setState("paused");
  isPlaying.value = false;
  notice.value =
    (event as unknown as { detail?: { errMsg?: string } }).detail?.errMsg || "视频加载失败";
}

function onVideoReady(event: Event) {
  const duration = Number((event as unknown as { detail?: { duration?: number } }).detail?.duration) || 0;
  if (duration > 0) durationSeconds.value = duration;
  if (currentPosition.value > 0) videoContext?.seek(currentPosition.value);
}

function seekFromProgress(event: Event) {
  if (!videoContext || !durationSeconds.value) return;
  const detail = (event as unknown as { detail?: { x?: number } }).detail;
  const x = Number(detail?.x);
  const width = Number((event.currentTarget as unknown as { offsetWidth?: number })?.offsetWidth);
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return;
  const nextPosition = Math.min(durationSeconds.value, Math.max(0, (x / width) * durationSeconds.value));
  videoContext.seek(nextPosition);
  currentPosition.value = nextPosition;
}

function applyRate(rate: number, persistSelection = false) {
  const next = restoreHoldRate(rate);
  videoContext?.playbackRate(next);
  controller?.setPlaybackRate(next);
  if (persistSelection && isPlaybackRatePreset(next)) playbackRate.value = next;
}

function togglePlayback() {
  if (suppressTap || holdBoosting.value) {
    suppressTap = false;
    return;
  }
  if (!hasPlaybackUrl.value || !videoContext) return;
  if (isPlaying.value) videoContext.pause();
  else videoContext.play();
}

function startHoldBoost() {
  if (!isPlaying.value || holdBoosting.value || !videoContext) return;
  suppressTap = true;
  holdBoosting.value = true;
  holdRestoreRate = playbackRate.value;
  applyRate(holdBoostRate());
}

function endHoldBoost() {
  if (!holdBoosting.value) return;
  holdBoosting.value = false;
  applyRate(holdRestoreRate);
  suppressTap = true;
  setTimeout(() => {
    suppressTap = false;
  }, 80);
}

function changeRate(rate: number) {
  if (!isPlaybackRatePreset(rate)) return;
  holdRestoreRate = rate;
  playbackRate.value = rate;
  if (!holdBoosting.value) applyRate(rate, true);
}

function goBack() {
  uni.navigateBack();
}

function enterFullScreen() {
  const context = videoContext as unknown as {
    requestFullScreen?: (options?: { direction?: number }) => void;
  } | null;
  context?.requestFullScreen?.({ direction: 0 });
}

function requireSocialUser(): boolean {
  if (isMock || getStoredSession()) return true;
  uni.showToast({ title: "请先登录后再收藏或点赞", icon: "none" });
  return false;
}

async function hydrateLibraryFlags() {
  if (!dramaId.value || (!isMock && !getStoredSession())) return;
  try {
    const social = getApi().social;
    const [favorited, liked] = await Promise.all([
      dramaInLibraryPages((page) => social.getFavorites(page), dramaId.value),
      dramaInLibraryPages((page) => social.getLikedDramas(page), dramaId.value)
    ]);
    isFavorite.value = favorited;
    isLiked.value = liked;
  } catch {
    // Keep local flags; missing library rows are treated as not saved.
  }
}

async function toggleFavorite() {
  if (!requireSocialUser() || !dramaId.value) return;
  const next = !isFavorite.value;
  try {
    await setDramaLibraryFlag(FAVORITE_TAB, dramaId.value, next);
    isFavorite.value = next;
    favoriteCount.value += next ? 1 : -1;
    uni.showToast({ title: next ? "已收藏到我的片单" : "已取消收藏", icon: "none" });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  }
}

async function toggleLike() {
  if (!requireSocialUser() || !dramaId.value) return;
  const next = !isLiked.value;
  try {
    await setDramaLibraryFlag(LIKE_TAB, dramaId.value, next);
    isLiked.value = next;
    likeCount.value += next ? 1 : -1;
    uni.showToast({ title: next ? "已点赞" : "已取消点赞", icon: "none" });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  }
}

function shareCurrent() {
  shareIfExternallyAllowed(
    shareDramaText(dramaTitle.value, `第${episodeNumber.value}集`),
    !isMock
  );
}

onLoad((options) => {
  try {
    const info = uni.getSystemInfoSync();
    const statusBar = Number(info.statusBarHeight) || 20;
    const menuButton = (uni as unknown as {
      getMenuButtonBoundingClientRect?: () => { bottom?: number };
    }).getMenuButtonBoundingClientRect?.();
    const menuBottom = Number(menuButton?.bottom) || 0;
    // H5 has no WeChat capsule rectangle; keep the mock banner and top controls
    // visually separate while real mini programs use the measured capsule bottom.
    statusBarInset.value = Math.max(44, statusBar, menuBottom + 4);
  } catch {
    statusBarInset.value = 44;
  }
  dramaId.value = decodeRouteValue(options?.dramaId);
  episodeId.value = decodeRouteValue(options?.episodeId);
  dramaTitle.value = decodeRouteValue(options?.title) || "短剧";
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
    <internal-banner :visible="isMock" />
    <view class="stage" :class="{ 'stage-empty': loading || error || !hasPlaybackUrl }">
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
        :controls="false"
        :show-center-play-btn="false"
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
      <view v-if="hasPlaybackUrl" class="immersive-topbar" :style="{ paddingTop: `${statusBarInset}px` }">
        <view class="topbar-back" role="button" aria-label="返回" @tap="goBack">‹</view>
        <view class="topbar-episode">第{{ episodeNumber }}集</view>
        <view class="topbar-spacer" />
        <view class="speed-trigger" role="button" aria-label="打开倍速" @tap="openSpeedDrawer">
          <text>倍速</text>
        </view>
      </view>
      <view
        v-if="hasPlaybackUrl"
        class="playback-toggle"
        role="button"
        aria-label="暂停、播放或长按加速"
        @tap="togglePlayback"
        @longpress="startHoldBoost"
        @touchend="endHoldBoost"
        @touchcancel="endHoldBoost"
      />
      <view v-if="hasPlaybackUrl && !isPlaying" class="play-mark" aria-hidden="true"><view class="play-triangle" /></view>
      <view v-else-if="hasPlaybackUrl && holdBoosting" class="boost-mark" aria-live="polite">{{ holdBoostRate() }}x</view>
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
      <view v-if="hasPlaybackUrl" class="video-caption" role="button" aria-label="进入短剧详情" @tap="goToDrama">
        <view class="caption-badge">弹</view>
        <view class="caption-title">第{{ episodeNumber }}集｜{{ dramaTitle }} <text class="caption-chevron">›</text></view>
      </view>
      <view v-if="hasPlaybackUrl" class="progress-bar" role="slider" aria-label="播放进度" @tap.stop="seekFromProgress">
        <view class="progress-track"><view class="progress-fill" :style="{ width: `${progressPercent}%` }"><view class="progress-thumb" /></view></view>
      </view>
    </view>

    <view v-if="notice" class="notice" role="status">{{ notice }}</view>
    <view v-if="hasPlaybackUrl" class="episode-footer">
      <view class="episode-bar" role="button" aria-label="打开选集" @tap="openEpisodeDrawer">
        <text>选集 · 全{{ drama?.episodeCount || 0 }}集</text>
        <text class="episode-bar-arrow">⌃</text>
      </view>
      <view class="fullscreen-button" role="button" aria-label="全屏播放" @tap="enterFullScreen"><view class="fullscreen-glyph" /></view>
    </view>

    <view v-if="speedDrawerOpen || episodeDrawerOpen" class="drawer-mask" @tap="closeDrawers">
      <view v-if="speedDrawerOpen" class="speed-drawer" @tap.stop>
        <view class="drawer-close" role="button" aria-label="关闭倍速" @tap="closeDrawers">⌄</view>
        <view class="drawer-title">倍速</view>
        <view v-for="item in displayRates" :key="item" class="speed-option" :class="{ active: playbackRate === item }" role="button" :aria-pressed="playbackRate === item" @tap="changeRate(item); closeDrawers()">
          <text>{{ item.toFixed(2).replace(/0$/, "") }}x<span v-if="item === PLAYBACK_RATE_DEFAULT">（默认）</span></text>
          <text v-if="playbackRate === item" class="selected-mark">⌄</text>
        </view>
      </view>

      <view v-else class="episode-drawer" @tap.stop>
        <view class="drawer-close" role="button" aria-label="关闭选集" @tap="closeDrawers">⌄</view>
        <view class="drawer-title">选集 <text class="drawer-count">· 全{{ drama?.episodeCount || 0 }}集</text></view>
        <scroll-view v-if="episodeRanges.length" class="episode-drawer-scroll" scroll-y :show-scrollbar="false">
          <view class="episode-ranges">
            <text v-for="(range, index) in episodeRanges" :key="range.label" class="episode-range" :class="{ active: activeEpisodeRange === index }" @tap="selectEpisodeRange(index)">{{ range.label }}</text>
          </view>
          <view class="episode-grid">
            <view v-for="episode in episodeRanges[activeEpisodeRange]?.episodes || []" :key="episode.id" class="episode-cell" :class="{ active: episode.id === episodeId }" role="button" :aria-label="`第${episode.episodeNumber}集`" @tap="selectEpisode(episode)">
              {{ episode.episodeNumber }}
              <text v-if="episode.id === episodeId" class="episode-playing">Ⅱ</text>
            </view>
          </view>
        </scroll-view>
        <view v-else class="drawer-empty">暂无剧集</view>
      </view>
    </view>

    <RewardUnlockSheet
      :visible="unlockVisible"
      :episode-number="unlockEpisode?.episodeNumber || 0"
      :unlock-copy="unlockCopy"
      :loading="rewardLoading"
      :retry-pending="rewardRetryPending"
      :error="rewardError"
      @close="closeUnlock"
      @confirm="watchRewardAd"
    />
    <CommentSheet
      :visible="commentsOpen"
      :drama-title="dramaTitle"
      :drama-id="dramaId"
      :episode-id="episodeId"
      @close="commentsOpen = false"
    />
  </view>
</template>

<style scoped src="../../styles/player.scss"></style>
