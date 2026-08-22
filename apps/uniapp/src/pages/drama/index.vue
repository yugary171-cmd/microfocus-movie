<script setup lang="ts">
import type { DramaDetail, EntitlementSummary, EpisodeSummary, HomeFilterOptions } from "@microfocus/contracts";
import { publicDramaTags } from "@microfocus/contracts";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { nextTick, computed, ref } from "vue";
import { createRewardedVideoAd } from "../../platform/ads";
import RewardUnlockSheet from "../../components/reward-unlock-sheet/index.vue";
import { ensureSession, getApi, getStoredSession, isMockMode } from "@/shared/api";
import { dramaInLibraryPages, FAVORITE_TAB, setDramaLibraryFlag } from "@/features/library";
import { trackFunnelEvent } from "@/services/telemetry";
import {
  createRewardDependencies,
  describeRewardResult,
  retryRewardConfirmation,
  runRewardFlow,
  type PendingRewardConfirmation,
  type RewardFlowDependencies,
  type RewardResult
} from "@/features/playback";
import { getDeviceId, toFriendlyErrorMessage, episodeDurationsFromDrama, formatRewardUnlockCopy } from "@/shared/utils";
import { canStartEpisode, playerUrlFromEpisode } from "@/features/playback";
import { buildDramaShareCard } from "@/features/catalog";

const isMock = isMockMode();
const id = ref("");
const loading = ref(true);
const error = ref("");
const drama = ref<DramaDetail | null>(null);
const publicFilterOptions = ref<HomeFilterOptions | null>(null);
const displayTags = computed(() =>
  publicDramaTags(Array.isArray(drama.value?.tags) ? drama.value.tags : [], publicFilterOptions.value ?? undefined)
);
const navInsetTop = ref(52);
const summaryExpanded = ref(false);
const summaryOverflow = ref(false);
const isFavorite = ref(false);
const favoriteLoading = ref(false);
const entitlement = ref<EntitlementSummary | null>(null);
const unlockCopy = ref(formatRewardUnlockCopy("", []));
const unlockVisible = ref(false);
const unlockEpisode = ref<EpisodeSummary | null>(null);
const rewardLoading = ref(false);
const loginLoading = ref(false);
const rewardError = ref("");
const rewardRetryPending = ref(false);
let rewardDependencies: RewardFlowDependencies | null = null;
let pendingRewardConfirmation: PendingRewardConfirmation | null = null;

function measureNavInset() {
  try {
    const info = uni.getSystemInfoSync();
    const statusBar = Number(info.statusBarHeight) || 20;
    const menu = typeof uni.getMenuButtonBoundingClientRect === "function"
      ? uni.getMenuButtonBoundingClientRect()
      : null;
    const menuBottom = Number(menu?.bottom);
    navInsetTop.value = (Number.isFinite(menuBottom) && menuBottom > 0 ? menuBottom : statusBar + 32) + 8;
  } catch {
    navInsetTop.value = 52;
  }
}

function applyEntitlement(summary: EntitlementSummary | null) {
  entitlement.value = summary;
  const durations = episodeDurationsFromDrama(drama.value);
  unlockCopy.value = formatRewardUnlockCopy(drama.value?.title ?? "", durations);
}

async function loadEntitlement() {
  try {
    applyEntitlement(await getApi().getEntitlement(id.value));
  } catch {
    // Existing detail remains usable for free episodes.
  }
}

async function loadDetail() {
  loading.value = true;
  error.value = "";
  summaryExpanded.value = false;
  summaryOverflow.value = false;
  try {
    const [detail, summary, catalog] = await Promise.all([
      getApi().getDrama(id.value),
      getApi().getEntitlement(id.value).catch(() => null),
      getApi().getCatalog().catch(() => null)
    ]);
    drama.value = detail;
    publicFilterOptions.value = catalog?.filterOptions ?? null;
    applyEntitlement(summary);
    await nextTick();
    measureSummaryOverflow();
    void hydrateFavoriteState();
    trackFunnelEvent("drama_detail_view", { dramaId: detail.id });
    uni.setNavigationBarTitle({ title: detail.title || "短剧详情" });
    if (!isMock) {
      try {
        uni.showShareMenu({ menus: ["shareAppMessage"] });
      } catch {
        // H5 has no share menu
      }
    }
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    drama.value = null;
  } finally {
    loading.value = false;
  }
}

function toggleSummary() {
  summaryExpanded.value = !summaryExpanded.value;
}

function goBack() {
  uni.navigateBack();
}

function measureSummaryOverflow() {
  uni
    .createSelectorQuery()
    .select(".summary-measure")
    .boundingClientRect((rect) => {
      const windowWidth = uni.getSystemInfoSync().windowWidth;
      const lineHeight = (28 * 1.6 * windowWidth) / 750;
      const node = Array.isArray(rect) ? rect[0] : rect;
      summaryOverflow.value = Boolean(
        node && typeof node.height === "number" && node.height > lineHeight * 2 + 1
      );
    })
    .exec();
}

async function hydrateFavoriteState() {
  if (!id.value || (!isMock && !getStoredSession())) return;
  try {
    isFavorite.value = await dramaInLibraryPages(
      (page) => getApi().social.getFavorites(page),
      id.value
    );
  } catch {
    // Keep the local flag when the library cannot be read.
  }
}

async function toggleFavorite() {
  if (favoriteLoading.value || !id.value) return;
  if (!isMock && !getStoredSession()) {
    uni.showToast({ title: "请先登录后再收藏", icon: "none" });
    return;
  }
  const next = !isFavorite.value;
  favoriteLoading.value = true;
  try {
    await setDramaLibraryFlag(FAVORITE_TAB, id.value, next);
    isFavorite.value = next;
    uni.showToast({ title: next ? "已收藏到我的片单" : "已取消收藏", icon: "none" });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  } finally {
    favoriteLoading.value = false;
  }
}

function openPlayer(episode: EpisodeSummary) {
  const current = drama.value;
  if (!current) return;
  uni.navigateTo({ url: playerUrlFromEpisode(current, episode) });
}

async function loginForLockedEpisode(): Promise<boolean> {
  if (loginLoading.value) return false;
  loginLoading.value = true;
  try {
    const session = await ensureSession();
    await loadEntitlement();
    return Boolean(getStoredSession() ?? session);
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
    return false;
  } finally {
    loginLoading.value = false;
  }
}

async function selectEpisode(episode: EpisodeSummary) {
  const current = drama.value;
  if (!current) return;
  const remaining = entitlement.value?.remainingSeconds ?? 0;
  if (!canStartEpisode(episode.episodeNumber, remaining)) {
    if (!getStoredSession()) {
      trackFunnelEvent("lock_intercept_shown", { dramaId: current.id, episodeNumber: episode.episodeNumber });
      if (!(await loginForLockedEpisode())) return;
      const refreshedRemaining = entitlement.value?.remainingSeconds ?? 0;
      if (canStartEpisode(episode.episodeNumber, refreshedRemaining)) {
        openPlayer(episode);
        return;
      }
    }
    unlockVisible.value = true;
    unlockEpisode.value = episode;
    rewardError.value = "";
    trackFunnelEvent("lock_intercept_shown", { dramaId: current.id, episodeNumber: episode.episodeNumber });
    return;
  }
  openPlayer(episode);
}

function closeUnlock() {
  if (!rewardLoading.value) unlockVisible.value = false;
}

async function watchRewardAd() {
  if (rewardLoading.value || !drama.value) return;
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
    applyEntitlement(result.entitlement);
    trackFunnelEvent("entitlement_credited", { dramaId: drama.value.id });
    const episode = unlockEpisode.value;
    unlockVisible.value = false;
    rewardLoading.value = false;
    rewardRetryPending.value = false;
    uni.showToast({ title: "已获得观看时长", icon: "success" });
    if (episode) openPlayer(episode);
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
  trackFunnelEvent("ad_fail", { dramaId: drama.value?.id, status: result.status });
}

onLoad((options) => {
  measureNavInset();
  id.value = options?.id ? decodeURIComponent(options.id) : "";
  if (!id.value) {
    loading.value = false;
    error.value = "缺少短剧编号";
    return;
  }
  void loadDetail();
});

onShow(() => {
  if (id.value && drama.value) {
    void loadEntitlement();
    void hydrateFavoriteState();
  }
});

onShareAppMessage(() => {
  const card = buildDramaShareCard({ isMock, drama: drama.value });
  if (!card) {
    return { title: "内部体验不可外传" };
  }
  return card;
});
</script>

<template>
  <view class="page">
    <view class="detail-nav" :style="{ paddingTop: `${navInsetTop}px` }">
      <view class="detail-back" role="button" aria-label="返回" @tap="goBack">‹</view>
      <text class="detail-nav-title">{{ drama?.title || "短剧详情" }}</text>
    </view>
    <internal-banner :visible="isMock" />
    <view v-if="loading" class="state-card" role="status">正在加载详情…</view>
    <view v-else-if="error" class="state-card" role="alert">
      <view class="state-title">无法打开短剧</view>
      <view>{{ error }}</view>
      <button class="secondary-button retry" @tap="loadDetail">重新加载</button>
    </view>
    <template v-else-if="drama">
      <view class="overview">
        <image
          v-if="drama.coverUrl"
          class="cover"
          :src="drama.coverUrl"
          mode="aspectFill"
          :aria-label="`${drama.title}封面`"
        />
        <view v-else class="cover placeholder" aria-hidden="true">剧</view>
        <view class="overview-content">
          <view class="title">{{ drama.title }}</view>
          <view class="meta">{{ drama.category }} · 全 {{ drama.episodeCount }} 集</view>
          <view class="tags">
            <text v-for="tag in displayTags" :key="tag" class="tag">{{ tag }} ›</text>
          </view>
        </view>
      </view>
      <view class="summary-section">
        <view class="section-title">剧情简介</view>
        <view class="summary-copy" :class="{ collapsed: !summaryExpanded }">
          {{ drama.summary || "暂无剧情简介" }}
        </view>
        <view class="summary-measure">{{ drama.summary || "暂无剧情简介" }}</view>
        <text v-if="summaryOverflow" class="summary-toggle" role="button" @tap="toggleSummary">
          {{ summaryExpanded ? "收起" : "展开" }}
        </text>
      </view>
    </template>
  </view>

  <view
    v-if="drama"
    class="favorite-button"
    :class="{ favorited: isFavorite }"
    role="button"
    :aria-pressed="isFavorite"
    aria-label="收藏"
    @tap="toggleFavorite"
  >
    <text class="favorite-icon" aria-hidden="true">☆</text>
    <text>{{ isFavorite ? "已收藏" : "收藏" }}</text>
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
</template>

<style scoped src="../../styles/drama.scss"></style>
