<script setup lang="ts">
import { SystemNotificationStatus } from "@microfocus/contracts";
import { ElButton as ElementButton, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import type { Component } from "vue";
import { AdminSearchInput } from "@/shared/components";
import { notificationStatusLabels } from "@/features/notifications/constants";

const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

defineProps<{ query: string; status: string }>();
const emit = defineEmits<{
  "update:query": [value: string];
  "update:status": [value: string];
  create: [];
  filter: [];
}>();
</script>

<template>
  <div :class="['toolbar', $style['notification-toolbar']]">
    <el-button :class="['button', 'button--primary', $style['toolbar__new']]" native-type="button" @click="emit('create')">新建通知</el-button>
    <AdminSearchInput
      :model-value="query"
      width="220px"
      :class="[$style['toolbar__search'], 'admin-list-search']"
      aria-label="搜索通知"
      placeholder="标题或正文"
      @update:model-value="emit('update:query', $event)"
      @submit="emit('filter')"
    />
    <el-select
      :model-value="status"
      :class="['admin-select', $style['notification-status-select']]"
      aria-label="通知状态"
      @update:model-value="emit('update:status', $event)"
      @change="emit('filter')"
    >
      <el-option label="全部" value="ALL" />
      <el-option :label="notificationStatusLabels[SystemNotificationStatus.DRAFT]" :value="SystemNotificationStatus.DRAFT" />
      <el-option :label="notificationStatusLabels[SystemNotificationStatus.PUBLISHED]" :value="SystemNotificationStatus.PUBLISHED" />
      <el-option :label="notificationStatusLabels[SystemNotificationStatus.RETRACTED]" :value="SystemNotificationStatus.RETRACTED" />
    </el-select>
  </div>
</template>

<style module lang="scss" src="../styles/notifications.module.scss"></style>
