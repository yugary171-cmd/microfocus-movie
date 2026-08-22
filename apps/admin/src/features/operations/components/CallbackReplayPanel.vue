<script setup lang="ts">
import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH, ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import type { Component } from "vue";
import { PageState, StatusBadge } from "@/shared/components";
import { formatDateTime } from "@/shared/utils/format";
import type { AdminCallbackEvent, CallbackReplayInput } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const props = defineProps<{ modelValue: CallbackReplayInput; events: AdminCallbackEvent[]; filter: string; busy: boolean }>();
const emit = defineEmits<{
  "update:modelValue": [patch: Partial<CallbackReplayInput>];
  "update:filter": [value: string];
  refresh: [];
  submit: [];
  fill: [event: AdminCallbackEvent];
}>();

function update<K extends keyof CallbackReplayInput>(key: K, value: CallbackReplayInput[K]): void {
  emit("update:modelValue", { [key]: value } as Partial<CallbackReplayInput>);
}
</script>

<template>
  <section :class="['panel', $style['panel--wide']]" aria-labelledby="replay-title">
    <div class="panel__header"><div><p class="eyebrow">CALLBACKS</p><h2 id="replay-title">死信重放</h2></div><StatusBadge label="受审计解锁" tone="warning" /></div>
    <form :class="$style['callback-filter']" @submit.prevent="emit('refresh')">
      <label class="field"><span>状态</span><el-select class="admin-select" :model-value="filter" aria-label="状态" @update:model-value="emit('update:filter', $event)"><el-option label="积压（默认）" value="BACKLOG" /><el-option label="死信" value="DEAD_LETTER" /><el-option label="可重试失败" value="RETRYABLE_FAILURE" /><el-option label="处理中" value="PROCESSING" /><el-option label="已接收" value="RECEIVED" /></el-select></label>
      <el-button class="button button--secondary" native-type="submit" :disabled="busy">刷新列表</el-button>
    </form>
    <PageState v-if="events.length === 0" type="empty" title="当前没有匹配的回调积压" message="死信与可重试失败会显示在此；列表不含加密载荷。" />
    <div v-else :class="['table-wrap', $style['callback-table']]">
      <table>
        <thead><tr><th>事件</th><th>Provider</th><th>状态</th><th>尝试</th><th>收到时间</th><th>载荷</th><th></th></tr></thead>
        <tbody>
          <tr v-for="event in events" :key="event.eventId">
            <td><code>{{ event.eventId }}</code><small>{{ event.eventType }}</small></td>
            <td>{{ event.provider }}</td>
            <td><StatusBadge :label="event.status" :tone="event.status === 'DEAD_LETTER' ? 'danger' : event.status === 'RETRYABLE_FAILURE' ? 'warning' : 'neutral'" /></td>
            <td>{{ event.attempts }}</td>
            <td class="nowrap">{{ formatDateTime(event.receivedAt) }}</td>
            <td>{{ event.payloadAvailable ? "可立即执行" : "需等待再投递" }}</td>
            <td><el-button v-if="event.replayable" class="button button--secondary" native-type="button" :disabled="busy" @click="emit('fill', event)">填入重放</el-button><span v-else>—</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <form :class="$style['compensation-form']" @submit.prevent="emit('submit')">
      <div class="form-grid">
        <label class="field"><span>回调事件 ID *</span><el-input class="admin-input" :model-value="modelValue.eventId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="provider 事件 ID" @update:model-value="update('eventId', $event)" /></label>
        <label class="field field--wide"><span>原因 *</span><el-input class="admin-input" type="textarea" :model-value="modelValue.reason" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明修复依据、工单与为何可以重放" @update:model-value="update('reason', $event)" /></label>
        <label class="field field--wide"><span>审批记录</span><el-input class="admin-input" type="textarea" :model-value="modelValue.approvalNote" :rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" @update:model-value="update('approvalNote', $event)" /></label>
      </div>
      <p :class="$style['form-help']">仅可将 RETRYABLE_FAILURE 或 DEAD_LETTER 迁回 PROCESSING，沿用原事件 ID。若事件仍在保留期内且存有加密规范化载荷，服务端会立即用该载荷执行，不复制新的 grant/媒体事实。无载荷或已过保留期时只解锁，等待 provider 再次投递。已处理或已拒绝事件不可重放。</p>
      <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并解锁重放</el-button>
    </form>
  </section>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
