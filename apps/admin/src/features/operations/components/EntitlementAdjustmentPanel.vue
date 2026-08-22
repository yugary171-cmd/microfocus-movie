<script setup lang="ts">
import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH, ENTITY_ID_MAX_LENGTH, ENTITLEMENT_SECONDS_MAX } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import type { Component } from "vue";
import { StatusBadge } from "@/shared/components";
import type { AdjustmentInput } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

defineProps<{ modelValue: AdjustmentInput; busy: boolean }>();
const emit = defineEmits<{ "update:modelValue": [patch: Partial<AdjustmentInput>]; submit: [] }>();

function update<K extends keyof AdjustmentInput>(key: K, value: AdjustmentInput[K]): void {
  emit("update:modelValue", { [key]: value } as Partial<AdjustmentInput>);
}
</script>

<template>
  <section :class="['panel', $style['panel--wide']]" aria-labelledby="adjustment-title">
    <div class="panel__header"><div><p class="eyebrow">LEDGER</p><h2 id="adjustment-title">权益纠错</h2></div><StatusBadge label="追加事实" tone="warning" /></div>
    <form :class="$style['compensation-form']" @submit.prevent="emit('submit')">
      <div class="form-grid">
        <label class="field"><span>类型 *</span><el-select class="admin-select" :model-value="modelValue.type" aria-label="类型" @update:model-value="update('type', $event)"><el-option label="冻结剩余" value="FREEZE_REMAINDER" /><el-option label="释放冻结" value="RELEASE_FREEZE" /><el-option label="核销（不改余额）" value="WRITE_OFF" /></el-select></label>
        <label class="field"><span>Grant ID *</span><el-input class="admin-input" :model-value="modelValue.grantId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="grant-…" @update:model-value="update('grantId', $event)" /></label>
        <label class="field"><span>秒数 *</span><el-input class="admin-input" type="number" :model-value="modelValue.seconds" min="1" :max="ENTITLEMENT_SECONDS_MAX" required @update:model-value="update('seconds', Number($event))" /></label>
        <label v-if="modelValue.type === 'RELEASE_FREEZE'" class="field"><span>原冻结记录 ID *</span><el-input class="admin-input" :model-value="modelValue.freezeAdjustmentId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="adjustment-…" @update:model-value="update('freezeAdjustmentId', $event)" /></label>
        <label class="field field--wide"><span>原因 *</span><el-input class="admin-input" type="textarea" :model-value="modelValue.reason" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单与为何不能改原 grant/debit" @update:model-value="update('reason', $event)" /></label>
        <label class="field field--wide"><span>审批记录</span><el-input class="admin-input" type="textarea" :model-value="modelValue.approvalNote" :rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" @update:model-value="update('approvalNote', $event)" /></label>
      </div>
      <p :class="$style['form-help']">冻结会降低可播放余额；释放冻结必须引用原冻结记录且不超过未释放秒数；核销只记事故，不再次改变用户余额。补偿请用上方独立授予，不要改历史 grant。</p>
      <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并写入纠错</el-button>
    </form>
  </section>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
