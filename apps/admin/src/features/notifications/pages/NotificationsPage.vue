<script setup lang="ts">
import {
  SYSTEM_NOTIFICATION_BODY_MAX_LENGTH,
  SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH,
  SystemNotificationStatus,
} from "@microfocus/contracts";
import {
  ElButton as ElementButton,
  ElDrawer as ElementDrawer,
  ElInput as ElementInput,
  ElOption as ElementOption,
  ElSelect as ElementSelect,
} from "element-plus";
import { Check, CopyDocument } from "@element-plus/icons-vue";
import { AdminPagination, AdminSearchInput, AdminTable, PageState } from "@/shared/components";
import { notificationStatusLabels } from "@/features/notifications/constants";
import { useNotificationsPage } from "@/features/notifications/composables/useNotificationsPage";
import type { Component } from "vue";

// Element Plus 2.14 exposes raw prop-definition types through SFCWithInstall;
// keep runtime component registration while avoiding false-positive template errors in vue-tsc.
const ElButton = ElementButton as Component;
const ElDrawer = ElementDrawer as Component;
const ElInput = ElementInput as Component;
const CheckIcon = Check as Component;
const CopyDocumentIcon = CopyDocument as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const {
  allowed,
  items,
  total,
  page,
  pageSize,
  loading,
  busy,
  error,
  notice,
  query,
  status,
  editing,
  viewing,
  drawerOpen,
  drawerMode,
  viewLoading,
  form,
  copiedNotificationKey,
  notificationColumns,
  drawerTitle,
  copyNotificationValue,
  startCreate,
  openEditor,
  openView,
  closeDrawer,
  filter,
  go,
  changePageSize,
  statusLabel,
  dateLabel,
  save,
  publish,
  retract,
  deleteDraft,
} = useNotificationsPage();
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">SYSTEM NOTICES</p>
        <h1>系统通知</h1>
        <p>发布面向全部登录用户的公共消息；已发布内容不可直接编辑。</p>
      </div>
    </header>
    <PageState
      v-if="!allowed"
      type="forbidden"
      message="只有系统管理员可以管理系统通知。"
    />
    <section v-else class="panel notice-panel">
      <div v-if="error" class="operation-message operation-message--error">
        {{ error }}
      </div>
      <div v-if="notice" class="operation-message">{{ notice }}</div>
      <div class="toolbar notification-toolbar">
        <el-button class="button button--primary toolbar__new" native-type="button" @click="openEditor()">新建通知</el-button>
        <AdminSearchInput
          v-model="query"
          width="220px"
          class="toolbar__search admin-list-search"
          aria-label="搜索通知"
          placeholder="标题或正文"
          @submit="filter"
        />
        <el-select
          v-model="status"
          class="admin-select notification-status-select"
          aria-label="通知状态"
          @change="filter"
        >
          <el-option label="全部" value="ALL" />
          <el-option :label="notificationStatusLabels[SystemNotificationStatus.DRAFT]" :value="SystemNotificationStatus.DRAFT" />
          <el-option
            :label="notificationStatusLabels[SystemNotificationStatus.PUBLISHED]"
            :value="SystemNotificationStatus.PUBLISHED"
          />
          <el-option
            :label="notificationStatusLabels[SystemNotificationStatus.RETRACTED]"
            :value="SystemNotificationStatus.RETRACTED"
          />
        </el-select>
      </div>
        <PageState
          v-if="loading"
          type="loading"
          message="正在读取通知…"
        /><PageState
          v-else-if="items.length === 0"
          type="empty"
          title="暂无通知"
          message="可以先创建一条通知草稿。"
        />
        <div v-else class="notice-list">
          <AdminTable
            :rows="items"
            :columns="notificationColumns"
            table-class="notification-table"
            :action-width="260"
          >
            <template #cell-title="{ row }">
              <span class="notification-cell notification-cell--copyable">
                <span class="notification-cell__text">{{ row.title }}</span>
                <button
                  class="notification-copy"
                  type="button"
                  :title="copiedNotificationKey === `title:${row.id}` ? '已复制' : '复制通知标题'"
                  :aria-label="copiedNotificationKey === `title:${row.id}` ? '通知标题已复制' : '复制通知标题'"
                  @click.stop="copyNotificationValue(`title:${row.id}`, row.title)"
                >
                  <component
                    :is="copiedNotificationKey === `title:${row.id}` ? CheckIcon : CopyDocumentIcon"
                    aria-hidden="true"
                  />
                </button>
              </span>
            </template>
            <template #cell-publisher="{ row }">
              <span class="notification-cell notification-cell--copyable">
                <span class="notification-cell__text">{{ row.createdByAdminName || "未知管理员" }}</span>
                <button
                  class="notification-copy"
                  type="button"
                  :title="copiedNotificationKey === `publisher:${row.id}` ? '已复制' : '复制发布人'"
                  :aria-label="copiedNotificationKey === `publisher:${row.id}` ? '发布人已复制' : '复制发布人'"
                  @click.stop="copyNotificationValue(`publisher:${row.id}`, row.createdByAdminName || '未知管理员')"
                >
                  <component
                    :is="copiedNotificationKey === `publisher:${row.id}` ? CheckIcon : CopyDocumentIcon"
                    aria-hidden="true"
                  />
                </button>
              </span>
            </template>
            <template #cell-createdAt="{ row }"><span class="nowrap">{{ dateLabel(row.createdAt) }}</span></template>
            <template #actions="{ row }">
              <div class="actions">
                <el-button class="admin-text-action" size="small" text type="primary" @click="openView(row)">
                  查看
                </el-button>
                <span
                  v-if="row.status === SystemNotificationStatus.DRAFT || row.status === SystemNotificationStatus.PUBLISHED"
                  class="actions__divider"
                  aria-hidden="true"
                  >|</span
                >
                <el-button
                  v-if="row.status === SystemNotificationStatus.DRAFT"
                  class="admin-text-action"
                  size="small"
                  text
                  type="primary"
                  @click="openEditor(row)"
                >
                  编辑
                </el-button>
                <span
                  v-if="row.status === SystemNotificationStatus.DRAFT"
                  class="actions__divider"
                  aria-hidden="true"
                  >|</span
                >
                <el-button
                  v-if="row.status === SystemNotificationStatus.DRAFT"
                  class="admin-text-action"
                  size="small"
                  text
                  type="primary"
                  :loading="busy"
                  @click="publish(row)"
                >
                  发布
                </el-button>
                <span
                  v-if="row.status === SystemNotificationStatus.DRAFT"
                  class="actions__divider"
                  aria-hidden="true"
                  >|</span
                >
                <el-button
                  v-if="row.status === SystemNotificationStatus.DRAFT"
                  class="admin-text-action"
                  size="small"
                  text
                  type="primary"
                  :loading="busy"
                  @click="deleteDraft(row)"
                >
                  删除
                </el-button>
                <el-button
                  v-if="row.status === SystemNotificationStatus.PUBLISHED"
                  class="admin-text-action"
                  size="small"
                  text
                  type="primary"
                  :loading="busy"
                  @click="retract(row)"
                >
                  撤回
                </el-button>
              </div>
            </template>
          </AdminTable>
        </div>
        <AdminPagination
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :disabled="loading"
          @page-change="go"
          @page-size-change="changePageSize"
        />
    </section>
    <el-drawer
      v-model="drawerOpen"
      :title="drawerTitle"
      direction="rtl"
      size="min(640px, 92vw)"
    >
      <template v-if="drawerMode === 'editor'">
        <p class="drawer-description">
          纯文本通知，发布后如需修改请新建一条。
        </p>
        <div class="field">
          <span>标题</span
          ><el-input
            v-model="form.title"
            class="admin-input"
            :maxlength="SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH"
            placeholder="通知标题"
          />
        </div>
        <div class="field field--body">
          <span>正文</span
          ><el-input
            v-model="form.body"
            class="admin-input"
            type="textarea"
            :maxlength="SYSTEM_NOTIFICATION_BODY_MAX_LENGTH"
            :rows="14"
            placeholder="通知正文"
          />
        </div>
      </template>
      <template v-else>
        <PageState
          v-if="viewLoading"
          type="loading"
          message="正在读取通知内容…"
        />
        <template v-else-if="viewing">
          <h3>{{ viewing.title }}</h3>
          <dl class="notice-meta">
            <div>
              <dt>发布人</dt>
              <dd>{{ viewing.createdByAdminName || "未知管理员" }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{{ statusLabel(viewing.status) }}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{{ dateLabel(viewing.createdAt) }}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>{{ dateLabel(viewing.publishedAt) }}</dd>
            </div>
          </dl>
          <div class="notice-body">
            <span>正文</span>
            <p>{{ viewing.body }}</p>
          </div>
        </template>
      </template>
      <template #footer>
        <template v-if="drawerMode === 'editor'">
          <el-button text type="info" :disabled="busy" @click="startCreate"
            >清空</el-button
          >
          <el-button :disabled="busy" @click="closeDrawer">取消</el-button>
          <el-button
            type="primary"
            :loading="busy"
            :disabled="!form.title.trim() || !form.body.trim()"
            @click="save"
            >保存草稿</el-button
          >
        </template>
        <el-button v-else @click="closeDrawer">关闭</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped src="../styles/notifications.css"></style>
