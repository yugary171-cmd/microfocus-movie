<script setup lang="ts">
import { PageState } from "@/shared/components";
import {
  NotificationEditorDrawer,
  NotificationTable,
  NotificationToolbar,
  NotificationViewerDrawer,
} from "@/features/notifications/components";
import { useNotificationsPage } from "@/features/notifications/composables/useNotificationsPage";

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

function updateForm(patch: Partial<typeof form>): void {
  Object.assign(form, patch);
}

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
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以管理系统通知。" />
    <section v-else :class="['panel', $style['notice-panel']]">
      <div v-if="error" :class="[$style['operation-message'], $style['operation-message--error']]">{{ error }}</div>
      <div v-if="notice" :class="$style['operation-message']">{{ notice }}</div>
      <NotificationToolbar
        :query="query"
        :status="status"
        @update:query="query = $event"
        @update:status="status = $event"
        @create="openEditor()"
        @filter="filter"
      />
      <PageState v-if="loading" type="loading" message="正在读取通知…" />
      <PageState v-else-if="items.length === 0" type="empty" title="暂无通知" message="可以先创建一条通知草稿。" />
      <NotificationTable
        v-else
        :rows="items"
        :columns="notificationColumns"
        :copied-key="copiedNotificationKey"
        :busy="busy"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :loading="loading"
        :date-label="dateLabel"
        :status-label="statusLabel"
        @copy="copyNotificationValue"
        @view="openView"
        @edit="openEditor"
        @publish="publish"
        @retract="retract"
        @delete="deleteDraft"
        @page-change="go"
        @page-size-change="changePageSize"
      />
    </section>
    <NotificationEditorDrawer
      :open="drawerOpen && drawerMode === 'editor'"
      :title="drawerTitle"
      :form="form"
      :busy="busy"
      @update:open="drawerOpen = $event"
      @update:form="updateForm"
      @clear="startCreate"
      @save="save"
      @close="closeDrawer"
    />
    <NotificationViewerDrawer
      :open="drawerOpen && drawerMode === 'view'"
      :title="drawerTitle"
      :loading="viewLoading"
      :notification="viewing"
      :status-label="statusLabel"
      :date-label="dateLabel"
      @update:open="drawerOpen = $event"
      @close="closeDrawer"
    />
  </div>
</template>

<style module lang="scss" src="../styles/notifications.module.scss"></style>
