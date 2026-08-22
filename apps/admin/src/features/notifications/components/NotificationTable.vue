<script setup lang="ts">
import { SystemNotificationStatus } from "@microfocus/contracts";
import { Check, CopyDocument } from "@element-plus/icons-vue";
import { ElButton as ElementButton } from "element-plus";
import { AdminPagination, AdminTable, type AdminTableColumn } from "@/shared/components";
import type { Component } from "vue";
import type { AdminNotificationRecord } from "@/shared/types";

const CheckIcon = Check as Component;
const CopyDocumentIcon = CopyDocument as Component;
const ElButton = ElementButton as Component;

defineProps<{
  rows: AdminNotificationRecord[];
  columns: AdminTableColumn[];
  copiedKey: string;
  busy: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  loading: boolean;
  dateLabel: (value: string | null) => string;
  statusLabel: (status: SystemNotificationStatus) => string;
}>();

const emit = defineEmits<{
  copy: [key: string, value: string];
  view: [item: AdminNotificationRecord];
  edit: [item: AdminNotificationRecord];
  publish: [item: AdminNotificationRecord];
  retract: [item: AdminNotificationRecord];
  delete: [item: AdminNotificationRecord];
  "page-change": [page: number];
  "page-size-change": [pageSize: number];
}>();
</script>

<template>
  <div :class="$style['notice-list']">
    <AdminTable :rows="rows" :columns="columns" table-class="notification-table" :action-width="260">
      <template #cell-title="{ row }">
        <span :class="$style['notification-cell']">
          <span :class="$style['notification-cell__text']">{{ row.title }}</span>
          <button
            :class="$style['notification-copy']"
            type="button"
            :title="copiedKey === `title:${row.id}` ? '已复制' : '复制通知标题'"
            :aria-label="copiedKey === `title:${row.id}` ? '通知标题已复制' : '复制通知标题'"
            @click.stop="emit('copy', `title:${row.id}`, row.title)"
          >
            <component :is="copiedKey === `title:${row.id}` ? CheckIcon : CopyDocumentIcon" aria-hidden="true" />
          </button>
        </span>
      </template>
      <template #cell-publisher="{ row }">
        <span :class="$style['notification-cell']">
          <span :class="$style['notification-cell__text']">{{ row.createdByAdminName || "未知管理员" }}</span>
          <button
            :class="$style['notification-copy']"
            type="button"
            :title="copiedKey === `publisher:${row.id}` ? '已复制' : '复制发布人'"
            :aria-label="copiedKey === `publisher:${row.id}` ? '发布人已复制' : '复制发布人'"
            @click.stop="emit('copy', `publisher:${row.id}`, row.createdByAdminName || '未知管理员')"
          >
            <component :is="copiedKey === `publisher:${row.id}` ? CheckIcon : CopyDocumentIcon" aria-hidden="true" />
          </button>
        </span>
      </template>
      <template #cell-createdAt="{ row }"><span :class="$style.nowrap">{{ dateLabel(row.createdAt) }}</span></template>
      <template #actions="{ row }">
        <div :class="$style.actions">
          <el-button class="admin-text-action" size="small" text type="primary" @click="emit('view', row)">查看</el-button>
          <span v-if="row.status === SystemNotificationStatus.DRAFT || row.status === SystemNotificationStatus.PUBLISHED" :class="$style['actions__divider']" aria-hidden="true">|</span>
          <el-button v-if="row.status === SystemNotificationStatus.DRAFT" class="admin-text-action" size="small" text type="primary" @click="emit('edit', row)">编辑</el-button>
          <span v-if="row.status === SystemNotificationStatus.DRAFT" :class="$style['actions__divider']" aria-hidden="true">|</span>
          <el-button v-if="row.status === SystemNotificationStatus.DRAFT" class="admin-text-action" size="small" text type="primary" :loading="busy" @click="emit('publish', row)">发布</el-button>
          <span v-if="row.status === SystemNotificationStatus.DRAFT" :class="$style['actions__divider']" aria-hidden="true">|</span>
          <el-button v-if="row.status === SystemNotificationStatus.DRAFT" class="admin-text-action" size="small" text type="primary" :loading="busy" @click="emit('delete', row)">删除</el-button>
          <el-button v-if="row.status === SystemNotificationStatus.PUBLISHED" class="admin-text-action" size="small" text type="primary" :loading="busy" @click="emit('retract', row)">撤回</el-button>
        </div>
      </template>
    </AdminTable>
    <AdminPagination
      :current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      :disabled="loading"
      @page-change="emit('page-change', $event)"
      @page-size-change="emit('page-size-change', $event)"
    />
  </div>
</template>

<style module lang="scss" src="../styles/notifications.module.scss"></style>
