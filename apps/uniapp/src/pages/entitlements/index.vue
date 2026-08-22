<script setup lang="ts">
import type { EntitlementGrantView, EntitlementSummary } from "@microfocus/contracts";
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi, isMockMode } from "@/shared/api";
import { toFriendlyErrorMessage } from "@/shared/utils";
import {
  ENTITLEMENT_INCOMPLETE_AD_LABEL,
  ENTITLEMENT_SCOPE_LABEL,
  episodeDurationsFromDrama,
  formatApproximateRemainingEpisodes,
  formatDateTime,
  formatRemainingTime,
  formatRewardUnlockCopy
} from "@/shared/utils";

interface GrantView extends EntitlementGrantView {
  sourceLabel: string;
  grantedLabel: string;
  remainingLabel: string;
  grantedAtLabel: string;
  expiresAtLabel: string;
}

const isMock = isMockMode();
const dramaId = ref("");
const loading = ref(true);
const error = ref("");
const summary = ref<EntitlementSummary | null>(null);
const remainingLabel = ref("约 0 集");
const nearestExpiryLabel = ref("暂无到期时间");
const grantCopy = ref(formatRewardUnlockCopy("", []));
const scopeLabel = ENTITLEMENT_SCOPE_LABEL;
const incompleteAdLabel = ENTITLEMENT_INCOMPLETE_AD_LABEL;
const grants = ref<GrantView[]>([]);

async function loadEntitlement() {
  loading.value = true;
  error.value = "";
  try {
    const [data, drama] = await Promise.all([
      getApi().getEntitlement(dramaId.value),
      getApi().getDrama(dramaId.value).catch(() => null)
    ]);
    const durations = episodeDurationsFromDrama(drama);
    summary.value = data;
    remainingLabel.value = formatApproximateRemainingEpisodes(data.remainingSeconds, durations);
    nearestExpiryLabel.value = formatDateTime(data.nearestExpiresAt);
    grantCopy.value = formatRewardUnlockCopy(drama?.title ?? "", durations);
    grants.value = data.grants.map((grant) => ({
      ...grant,
      sourceLabel: grant.source === "REWARDED_AD" ? "完整观看激励广告" : "平台补偿",
      grantedLabel: formatRemainingTime(grant.grantedSeconds),
      remainingLabel: formatRemainingTime(grant.remainingSeconds),
      grantedAtLabel: formatDateTime(grant.grantedAt),
      expiresAtLabel: formatDateTime(grant.expiresAt)
    }));
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    summary.value = null;
    grants.value = [];
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  dramaId.value = options?.dramaId ? decodeURIComponent(options.dramaId) : "";
  if (!dramaId.value) {
    loading.value = false;
    error.value = "缺少短剧编号，请从短剧详情进入权益明细";
    return;
  }
  void loadEntitlement();
});

onPullDownRefresh(() => {
  void loadEntitlement().finally(() => uni.stopPullDownRefresh());
});
</script>

<template>
  <view class="page">
    <internal-banner :visible="isMock" />
    <view class="page-title">权益明细</view>
    <view v-if="loading" class="state-card" role="status">正在加载权益…</view>
    <view v-else-if="error" class="state-card" role="alert">
      <view class="state-title">无法读取权益</view>
      <view>{{ error }}</view>
      <button v-if="dramaId" class="secondary-button retry" @tap="loadEntitlement">重试</button>
    </view>
    <template v-else-if="summary">
      <view class="summary-card">
        <view class="summary-label">当前短剧可用时长</view>
        <view class="remaining">{{ remainingLabel }}</view>
        <view class="expiry">最近到期：{{ nearestExpiryLabel }}</view>
        <view class="expiry">{{ scopeLabel }} · {{ incompleteAdLabel }}</view>
        <view class="grant-copy">{{ grantCopy }}</view>
      </view>
      <view class="section-title">发放记录</view>
      <view v-if="!grants.length" class="state-card">
        <view class="state-title">暂无权益记录</view>
        <view>完整观看激励广告且服务端校验通过后，记录会显示在这里。</view>
      </view>
      <view v-else>
        <view v-for="item in grants" :key="item.id" class="grant-card">
          <view class="grant-head">
            <view class="grant-source">{{ item.sourceLabel }}</view>
            <view class="grant-remaining">剩 {{ item.remainingLabel }}</view>
          </view>
          <view class="grant-row"><text>发放</text><text>{{ item.grantedLabel }}</text></view>
          <view class="grant-row"><text>发放时间</text><text>{{ item.grantedAtLabel }}</text></view>
          <view class="grant-row"><text>到期时间</text><text>{{ item.expiresAtLabel }}</text></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped src="../../styles/entitlements.scss"></style>
