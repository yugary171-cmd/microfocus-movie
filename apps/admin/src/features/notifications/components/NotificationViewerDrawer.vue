<script setup lang="ts">
import { ElButton as ElementButton, ElDrawer as ElementDrawer } from "element-plus";
import type { Component } from "vue";
import { PageState } from "@/shared/components";
import type { AdminNotificationRecord } from "@/shared/types";

const ElDrawer = ElementDrawer as Component;
const ElButton = ElementButton as Component;

defineProps<{
  open: boolean;
  title: string;
  loading: boolean;
  notification: AdminNotificationRecord | null;
  statusLabel: (status: AdminNotificationRecord["status"]) => string;
  dateLabel: (value: string | null) => string;
}>();

const emit = defineEmits<{ "update:open": [value: boolean]; close: [] }>();
</script>

<template>
  <el-drawer :model-value="open" :title="title" direction="rtl" size="min(640px, 92vw)" @update:model-value="emit('update:open', $event)">
    <PageState v-if="loading" type="loading" message="正在读取通知内容…" />
    <template v-else-if="notification">
      <h3>{{ notification.title }}</h3>
      <dl :class="$style['notice-meta']">
        <div><dt>发布人</dt><dd>{{ notification.createdByAdminName || "未知管理员" }}</dd></div>
        <div><dt>状态</dt><dd>{{ statusLabel(notification.status) }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ dateLabel(notification.createdAt) }}</dd></div>
        <div><dt>发布时间</dt><dd>{{ dateLabel(notification.publishedAt) }}</dd></div>
      </dl>
      <div :class="$style['notice-body']"><span>正文</span><p>{{ notification.body }}</p></div>
    </template>
    <template #footer><el-button @click="emit('close')">关闭</el-button></template>
  </el-drawer>
</template>

<style module lang="scss" src="../styles/notifications.module.scss"></style>
