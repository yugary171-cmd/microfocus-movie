<script setup lang="ts">
import { SYSTEM_NOTIFICATION_BODY_MAX_LENGTH, SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElDrawer as ElementDrawer, ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import type { NotificationForm } from "@/features/notifications/types";

const ElDrawer = ElementDrawer as Component;
const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

defineProps<{ open: boolean; title: string; form: NotificationForm; busy: boolean }>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:form": [patch: Partial<NotificationForm>];
  clear: [];
  save: [];
  close: [];
}>();
</script>

<template>
  <el-drawer :model-value="open" :title="title" direction="rtl" size="min(640px, 92vw)" @update:model-value="emit('update:open', $event)">
    <p :class="$style['drawer-description']">纯文本通知，发布后如需修改请新建一条。</p>
    <div :class="$style['notification-field']">
      <span>标题</span>
      <el-input class="admin-input" :model-value="form.title" :maxlength="SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH" placeholder="通知标题" @update:model-value="emit('update:form', { title: $event })" />
    </div>
    <div :class="[$style['notification-field'], $style['notification-field--body']]">
      <span>正文</span>
      <el-input class="admin-input" type="textarea" :model-value="form.body" :maxlength="SYSTEM_NOTIFICATION_BODY_MAX_LENGTH" :rows="14" placeholder="通知正文" @update:model-value="emit('update:form', { body: $event })" />
    </div>
    <template #footer>
      <el-button text type="info" :disabled="busy" @click="emit('clear')">清空</el-button>
      <el-button :disabled="busy" @click="emit('close')">取消</el-button>
      <el-button type="primary" :loading="busy" :disabled="!form.title.trim() || !form.body.trim()" @click="emit('save')">保存草稿</el-button>
    </template>
  </el-drawer>
</template>

<style module lang="scss" src="../styles/notifications.module.scss"></style>
