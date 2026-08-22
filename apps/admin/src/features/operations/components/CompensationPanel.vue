<script setup lang="ts">
import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH, COMPENSATION_SECONDS_MIN, ENTITY_ID_MAX_LENGTH, ENTITLEMENT_SECONDS_MAX } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import { StatusBadge } from "@/shared/components";
import type { CompensationInput } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

const props = defineProps<{ modelValue: CompensationInput; busy: boolean }>();
const emit = defineEmits<{ "update:modelValue": [patch: Partial<CompensationInput>]; submit: [] }>();

function update<K extends keyof CompensationInput>(key: K, value: CompensationInput[K]): void {
  emit("update:modelValue", { [key]: value } as Partial<CompensationInput>);
}
</script>

<template>
  <section class="panel" aria-labelledby="compensation-title">
    <div class="panel__header"><div><p class="eyebrow">ENTITLEMENT</p><h2 id="compensation-title">补偿权益</h2></div><StatusBadge label="人工授予" tone="warning" /></div>
    <form :class="$style['compensation-form']" @submit.prevent="emit('submit')">
      <div class="form-grid">
        <label class="field"><span>用户 ID *</span><el-input class="admin-input" :model-value="modelValue.userId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="用户内部 ID" @update:model-value="update('userId', $event)" /></label>
        <label class="field"><span>剧目 ID *</span><el-input class="admin-input" :model-value="modelValue.dramaId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="drama-…" @update:model-value="update('dramaId', $event)" /></label>
        <label class="field"><span>补偿时长（秒）*</span><el-input class="admin-input" type="number" :model-value="modelValue.seconds" :min="COMPENSATION_SECONDS_MIN" :max="ENTITLEMENT_SECONDS_MAX" :step="COMPENSATION_SECONDS_MIN" required @update:model-value="update('seconds', Number($event))" /></label>
        <label class="field field--wide"><span>补偿原因 *</span><el-input class="admin-input" type="textarea" :model-value="modelValue.reason" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单或用户影响" @update:model-value="update('reason', $event)" /></label>
      </div>
      <p :class="$style['form-help']">权益授予不可在浏览器中撤回；服务端将验证管理员权限、范围和幂等性。</p>
      <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并授予</el-button>
    </form>
  </section>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
