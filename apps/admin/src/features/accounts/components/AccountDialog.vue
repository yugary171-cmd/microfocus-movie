<script setup lang="ts">
import { ADMIN_DISPLAY_NAME_MAX_LENGTH, ADMIN_LOGIN_ID_MAX_LENGTH, ADMIN_LOGIN_ID_PATTERN_SOURCE, ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH, ASSIGNABLE_ADMIN_ROLES, OTP_INPUT_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import type { Component } from "vue";
import { roleLabels } from "@/shared/constants/labels";
import type { AdminAccountRecord } from "@/shared/types";
import type { AccountDialogForm, AccountDialogMode } from "@/features/accounts/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const props = defineProps<{
  mode: AccountDialogMode | null;
  selected: AdminAccountRecord | null;
  activeEditors: AdminAccountRecord[];
  form: AccountDialogForm;
  busy: boolean;
  error: string;
  needsReplacement: boolean;
  title: string;
  authUserId?: string;
}>();

const emit = defineEmits<{
  "update:form": [patch: Partial<AccountDialogForm>];
  close: [];
  submit: [];
}>();

function update<K extends keyof AccountDialogForm>(key: K, value: AccountDialogForm[K]): void {
  emit("update:form", { [key]: value } as Partial<AccountDialogForm>);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="mode" class="dialog-backdrop" @keydown.esc="emit('close')">
      <form :class="['dialog', $style['account-dialog']]" role="dialog" aria-modal="true" :aria-labelledby="`${mode}-title`" @submit.prevent="emit('submit')">
        <h2 :id="`${mode}-title`">{{ title }}</h2>
        <p v-if="selected">目标账号：{{ selected.displayName }}（{{ selected.email }}）</p>
        <template v-if="mode === 'create' || mode === 'edit'">
          <label class="field"><span>真实姓名 *</span><el-input class="admin-input" :model-value="form.displayName" autocomplete="off" :maxlength="ADMIN_DISPLAY_NAME_MAX_LENGTH" required @update:model-value="update('displayName', $event)" /></label>
          <label v-if="mode === 'create'" class="field"><span>登录名 *</span><el-input class="admin-input" :model-value="form.email" type="text" autocomplete="off" :maxlength="ADMIN_LOGIN_ID_MAX_LENGTH" :pattern="ADMIN_LOGIN_ID_PATTERN_SOURCE" required placeholder="name 或 name@company.com" @update:model-value="update('email', $event)" /><small>只作登录标识，不会用来收发邮件；已有带 @ 的账号仍可登录。</small></label>
          <label class="field"><span>角色 *</span><el-select class="admin-select" :model-value="form.role" aria-label="账号角色" placeholder="请选择账号角色" required @update:model-value="update('role', $event)"><el-option v-for="role in ASSIGNABLE_ADMIN_ROLES" :key="role" :label="roleLabels[role]" :value="role" /></el-select></label>
        </template>
        <label v-if="['create', 'edit', 'suspend', 'activate', 'invite', 'reset'].includes(mode)" class="field"><span>操作原因 *</span><el-input class="admin-input" :model-value="form.reason" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required @update:model-value="update('reason', $event)" /></label>
        <div v-if="mode === 'reset'" :class="$style['danger-note']">重置后目标账号会立即暂停，旧密码、TOTP 和现有会话全部失效，直到本人通过新链接重新开通。</div>
        <label v-if="needsReplacement" class="field"><span>接替内容编辑（待移交 {{ selected?.ownedDramaCount }} 部剧目）*</span><el-select class="admin-select" :model-value="form.replacementEditorId" aria-label="接替内容编辑" placeholder="请选择正常的内容编辑" required @update:model-value="update('replacementEditorId', $event)"><el-option v-for="editor in activeEditors" :key="editor.id" :label="`${editor.displayName} · ${editor.email}`" :value="editor.id" /></el-select></label>
        <label class="field"><span>当前管理员 TOTP 验证码 *</span><el-input class="admin-input" :model-value="form.otp" inputmode="numeric" autocomplete="one-time-code" :maxlength="OTP_INPUT_LENGTH" pattern="[0-9]*" required @update:model-value="update('otp', $event)" /></label>
        <div v-if="error" class="operation-message operation-message--error" role="alert">{{ error }}</div>
        <div class="dialog__actions"><el-button class="button button--ghost" native-type="button" :disabled="busy" @click="emit('close')">取消</el-button><el-button class="button" :class="['suspend', 'reset'].includes(mode) ? 'button--danger' : 'button--primary'" native-type="submit" :disabled="busy">{{ busy ? '处理中…' : '确认' }}</el-button></div>
      </form>
    </div>
  </Teleport>
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
