<script setup lang="ts">
import type { DramaDetail, EntitlementSummary, EpisodeSummary } from "@microfocus/contracts";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { createRewardedVideoAd } from "../../platform/ads";
import { getApi, isMockMode } from "../../services/api";
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
import { getDeviceId } from "../../utils/device";
import { canStartEpisode } from "../../utils/episode";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  ENTITLEMENT_INCOMPLETE_AD_LABEL,
  ENTITLEMENT_SCOPE_LABEL,
  episodeDurationsFromDrama,
  formatApproximateRemainingEpisodes,
  formatDateTime,
  formatRewardUnlockCopy
} from "../../utils/format";
import { playerUrlFromEpisode } from "../../utils/player-navigation";
import { buildDramaShareCard } from "../../utils/drama-share";

const isMock = isMockMode();
const id = ref("");
const loading = ref(true);
const error = ref("");
const drama = ref<DramaDetail | null>(null);
const entitlement = ref<EntitlementSummary | null>(null);
const remainingLabel = ref("约 0 集");
const expiryLabel = ref("暂无到期时间");
const scopeLabel = ENTITLEMENT_SCOPE_LABEL;
const incompleteAdLabel = ENTITLEMENT_INCOMPLETE_AD_LABEL;
const unlockCopy = ref(formatRewardUnlockCopy("", []));
const unlockVisible = ref(false);
const unlockEpisode = ref<EpisodeSummary | null>(null);
const rewardLoading = ref(false);
const rewardError = ref("");
const rewardRetryPending = ref(false);
let rewardDependencies: RewardFlowDependencies | null = null;
let pendingRewardConfirmation: PendingRewardConfirmation | null = null;

function applyEntitlement(summary: EntitlementSummary | null) {
  entitlement.value = summary;
  const durations = episodeDurationsFromDrama(drama.value);
  remainingLabel.value = formatApproximateRemainingEpisodes(summary?.remainingSeconds, durations);
  expiryLabel.value = formatDateTime(summary?.nearestExpiresAt);
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
  try {
    const [detail, summary] = await Promise.all([
      getApi().getDrama(id.value),
      getApi().getEntitlement(id.value).catch(() => null)
    ]);
    drama.value = detail;
    applyEntitlement(summary);
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

function openPlayer(episode: EpisodeSummary) {
  const current = drama.value;
  if (!current) return;
  uni.navigateTo({ url: playerUrlFromEpisode(current, episode) });
}

function selectEpisode(episode: EpisodeSummary) {
  const current = drama.value;
  if (!current) return;
  const remaining = entitlement.value?.remainingSeconds ?? 0;
  if (!canStartEpisode(episode.episodeNumber, remaining)) {
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
  id.value = options?.id ? decodeURIComponent(options.id) : "";
  if (!id.value) {
    loading.value = false;
    error.value = "缺少短剧编号";
    return;
  }
  void loadDetail();
});

onShow(() => {
  if (id.value && drama.value) void loadEntitlement();
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
          <view class="tags"><text v-for="tag in drama.tags" :key="tag">#{{ tag }} </text></view>
        </view>
      </view>
      <view class="summary">{{ drama.summary }}</view>
      <view class="filing">
        <view>网络剧片发行许可证/备案号</view>
        <view class="filing-number">{{ drama.licenseNumber || "暂未配置，请勿对外发布" }}</view>
        <view class="rights">版权方：{{ drama.rightsHolder || "暂未配置" }}</view>
      </view>
      <view class="entitlement" role="status">
        <view><text class="muted">当前短剧剩余</text> {{ remainingLabel }}</view>
        <view class="expiry">最近到期：{{ expiryLabel }}</view>
        <view class="expiry">{{ scopeLabel }} · {{ incompleteAdLabel }}</view>
        <navigator class="detail-link" :url="`/pages/entitlements/index?dramaId=${drama.id}`">
          查看权益明细
        </navigator>
      </view>
      <view class="section-title">选集</view>
      <view class="episode-grid">
        <button
          v-for="item in drama.episodes"
          :key="item.id"
          class="episode"
          :class="{ free: item.isFree }"
          :aria-label="`第 ${item.episodeNumber} 集，${item.isFree ? '免费' : '需要当前短剧观看时长'}`"
          @tap="selectEpisode(item)"
        >
          <text>{{ item.episodeNumber }}</text>
          <text class="episode-state">{{ item.isFree ? "免费" : "🔒" }}</text>
        </button>
      </view>
    </template>
  </view>

  <view v-if="unlockVisible" class="overlay" @tap="closeUnlock">
    <view class="dialog" role="dialog" aria-modal="true" aria-label="观看广告解锁" @tap.stop>
      <view class="dialog-title">观看广告，获得本剧时长</view>
      <view class="dialog-copy">
        第 {{ unlockEpisode?.episodeNumber }} 集需要当前短剧观看时长。{{ unlockCopy }}请主动点击下方按钮。
      </view>
      <view class="safety-note">广告完成回调并非绝对安全证明，最终发放结果以服务端校验为准。</view>
      <view v-if="rewardError" class="reward-error" role="alert">{{ rewardError }}</view>
      <button class="primary-button" :loading="rewardLoading" :disabled="rewardLoading" @tap="watchRewardAd">
        {{ rewardRetryPending ? "重试确认奖励" : "主动观看激励广告" }}
      </button>
      <button class="secondary-button cancel" :disabled="rewardLoading" @tap="closeUnlock">暂不观看</button>
    </view>
  </view>
</template>

<style scoped src="../../styles/drama.scss"></style>
