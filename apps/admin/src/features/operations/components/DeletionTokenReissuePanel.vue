<script setup lang="ts">
import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH, ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import { StatusBadge } from "@/shared/components";
import type { DeletionQueryTokenReissueInput } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

const props = defineProps<{ modelValue: DeletionQueryTokenReissueInput; busy: boolean }>();
const emit = defineEmits<{ "update:modelValue": [patch: Partial<DeletionQueryTokenReissueInput>]; submit: [] }>();

function update<K extends keyof DeletionQueryTokenReissueInput>(key: K, value: DeletionQueryTokenReissueInput[K]): void {
  emit("update:modelValue", { [key]: value } as Partial<DeletionQueryTokenReissueInput>);
}
</script>

<template>
  <section :class="['panel', $style['panel--wide']]" aria-labelledby="reissue-title">
    <div class="panel__header"><div><p class="eyebrow">PRIVACY</p><h2 id="reissue-title">注销查询令牌补发</h2></div><StatusBadge label="客服核验" tone="warning" /></div>
    <form :class="$style['compensation-form']" @submit.prevent="emit('submit')">
      <div class="form-grid">
        <label class="field"><span>注销申请 ID *</span><el-input class="admin-input" :model-value="modelValue.deletionRequestId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="deletion-request-…" @update:model-value="update('deletionRequestId', $event)" /></label>
        <label class="field"><span>已核验用户 ID *</span><el-input class="admin-input" :model-value="modelValue.userId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="必须与申请所属用户一致" @update:model-value="update('userId', $event)" /></label>
        <label class="field field--wide"><span>原因 *</span><el-input class="admin-input" type="textarea" :model-value="modelValue.reason" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明令牌遗失/过期、工单与核验方式" @update:model-value="update('reason', $event)" /></label>
        <label class="field field--wide"><span>审批/核验记录 *</span><el-input class="admin-input" type="textarea" :model-value="modelValue.approvalNote" :rows="2" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="审批人、工单号与身份核验结论" @update:model-value="update('approvalNote', $event)" /></label>
      </div>
      <p :class="$style['form-help']">旧 JWT 不会恢复。新令牌只在成功响应中出现一次，旧令牌立即失效。必须先核验用户身份，填写的用户 ID 必须与申请一致。Mock 模式只写演示审计。</p>
      <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并补发令牌</el-button>
    </form>
  </section>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
