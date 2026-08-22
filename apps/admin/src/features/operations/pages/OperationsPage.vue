<script setup lang="ts">
import { computed } from "vue";
import { ConfirmDialog, PageState } from "@/shared/components";
import {
  CallbackReplayPanel,
  CircuitBreakerPanel,
  CompensationPanel,
  DeletionTokenReissuePanel,
  EntitlementAdjustmentPanel,
} from "@/features/operations/components";
import { useOperationsPage } from "@/features/operations/composables/useOperationsPage";

const {
  allowed,
  loading,
  busy,
  error,
  notice,
  breaker,
  breakerDialogOpen,
  compensationDialogOpen,
  compensation,
  adjustmentDialogOpen,
  adjustment,
  replayDialogOpen,
  replay,
  callbackEvents,
  callbackFilter,
  reissueDialogOpen,
  reissue,
  load,
  refreshCallbacks,
  toggleBreaker,
  requestCompensation,
  grantCompensation,
  requestAdjustment,
  submitAdjustment,
  requestReplay,
  submitReplay,
  requestReissue,
  submitReissue,
  fillReplay,
} = useOperationsPage();

const adjustmentSummary = computed(() => {
  const freeze = adjustment.type === "RELEASE_FREEZE" ? `，冻结记录 ${adjustment.freezeAdjustmentId}` : "";
  return `将对 grant ${adjustment.grantId} 追加 ${adjustment.type} ${adjustment.seconds} 秒${freeze}。不会修改原 grant 或 debit。`;
});
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">SAFETY OPERATIONS</p>
        <h1>运营控制</h1>
        <p>本页自上而下为：全站熔断、补偿权益、权益纠错、死信重放、注销查询令牌补发。高风险操作只对管理员开放，并要求原因与二次确认。</p>
      </div>
    </header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以访问熔断、补偿和账本纠错。" />
    <PageState v-else-if="loading" type="loading" message="正在获取安全控制状态…" />
    <PageState v-else-if="error && !breaker" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" :class="[$style['operation-message'], $style['operation-message--error']]" role="alert">{{ error }}</div>
      <div v-if="notice" :class="$style['operation-message']" role="status">{{ notice }}</div>
      <div :class="$style['operation-grid']">
        <CircuitBreakerPanel v-if="breaker" :breaker="breaker" :busy="busy" @open="breakerDialogOpen = true" />
        <CompensationPanel
          :model-value="compensation"
          :busy="busy"
          @update:model-value="Object.assign(compensation, $event)"
          @submit="requestCompensation"
        />
        <EntitlementAdjustmentPanel
          :model-value="adjustment"
          :busy="busy"
          @update:model-value="Object.assign(adjustment, $event)"
          @submit="requestAdjustment"
        />
        <CallbackReplayPanel
          :model-value="replay"
          :events="callbackEvents"
          :filter="callbackFilter"
          :busy="busy"
          @update:model-value="Object.assign(replay, $event)"
          @update:filter="callbackFilter = $event"
          @refresh="refreshCallbacks"
          @submit="requestReplay"
          @fill="fillReplay"
        />
        <DeletionTokenReissuePanel
          :model-value="reissue"
          :busy="busy"
          @update:model-value="Object.assign(reissue, $event)"
          @submit="requestReissue"
        />
      </div>
    </template>
    <ConfirmDialog
      :open="breakerDialogOpen"
      :title="breaker?.enabled ? '恢复全站播放' : '开启全站播放熔断'"
      :message="breaker?.enabled ? '恢复后将重新允许创建播放租约，请确认故障已处置。' : '开启后将阻止新的播放租约。这是高影响操作，请说明事故原因。'"
      :confirm-label="breaker?.enabled ? '确认恢复' : '确认熔断'"
      :tone="breaker?.enabled ? 'primary' : 'danger'"
      require-reason
      :reason-label="breaker?.enabled ? '恢复依据' : '事故原因'"
      :busy="busy"
      @close="breakerDialogOpen = false"
      @confirm="toggleBreaker"
    />
    <ConfirmDialog
      :open="compensationDialogOpen"
      title="确认授予补偿权益"
      :message="`将向用户 ${compensation.userId} 授予剧目 ${compensation.dramaId} 的 ${compensation.seconds} 秒权益。请确认工单信息准确。`"
      confirm-label="确认授予"
      :busy="busy"
      @close="compensationDialogOpen = false"
      @confirm="grantCompensation"
    />
    <ConfirmDialog
      :open="adjustmentDialogOpen"
      title="确认写入权益纠错"
      :message="adjustmentSummary"
      confirm-label="确认写入"
      :busy="busy"
      @close="adjustmentDialogOpen = false"
      @confirm="submitAdjustment"
    />
    <ConfirmDialog
      :open="replayDialogOpen"
      title="确认解锁回调重放"
      :message="`将事件 ${replay.eventId} 迁回 PROCESSING，并在有加密载荷时立即执行。不会复制 grant、媒体或奖励事实。`"
      confirm-label="确认解锁"
      :busy="busy"
      @close="replayDialogOpen = false"
      @confirm="submitReplay"
    />
    <ConfirmDialog
      :open="reissueDialogOpen"
      title="确认补发注销查询令牌"
      :message="`将作废申请 ${reissue.deletionRequestId} 的旧查询令牌，并向已核验用户 ${reissue.userId} 签发新令牌。不会恢复登录会话。`"
      confirm-label="确认补发"
      :busy="busy"
      @close="reissueDialogOpen = false"
      @confirm="submitReissue"
    />
  </div>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
