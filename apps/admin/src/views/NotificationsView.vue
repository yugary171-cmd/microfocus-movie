<script setup lang="ts">
import {
  AdminRole,
  SYSTEM_NOTIFICATION_BODY_MAX_LENGTH,
  SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH,
  SystemNotificationStatus,
} from "@microfocus/contracts";
import {
  ElButton as ElementButton,
  ElDrawer as ElementDrawer,
  ElOption as ElementOption,
  ElSelect as ElementSelect,
  ElTable as ElementTable,
  ElTableColumn as ElementTableColumn,
} from "element-plus";
import { computed, onMounted, reactive, ref, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import { useAuthStore } from "@/stores/auth";
import type { AdminNotificationRecord } from "@/types/admin";

// Element Plus 2.14 exposes raw prop-definition types through SFCWithInstall;
// keep runtime component registration while avoiding false-positive template errors in vue-tsc.
const ElButton = ElementButton as Component;
const ElDrawer = ElementDrawer as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;
const ElTable = ElementTable as Component;
const ElTableColumn = ElementTableColumn as Component;

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AdminNotificationRecord[]>([]);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const query = ref("");
const status = ref("ALL");
const editing = ref<AdminNotificationRecord | null>(null);
const viewing = ref<AdminNotificationRecord | null>(null);
const drawerOpen = ref(false);
const viewLoading = ref(false);
const form = reactive({ title: "", body: "" });

async function load() {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listNotifications(
      query.value,
      status.value === "ALL" ? "" : status.value,
      1,
    );
    items.value = result.items;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}
function startCreate() {
  editing.value = null;
  form.title = "";
  form.body = "";
}
function startEdit(item: AdminNotificationRecord) {
  editing.value = item;
  form.title = item.title;
  form.body = item.body;
}
async function openView(item: AdminNotificationRecord) {
  viewing.value = item;
  drawerOpen.value = true;
  viewLoading.value = true;
  try {
    viewing.value = await adminApi.getNotification(item.id);
  } catch (caught) {
    error.value = toErrorMessage(caught);
    viewing.value = item;
  } finally {
    viewLoading.value = false;
  }
}
function closeView() {
  drawerOpen.value = false;
}
function statusLabel(status: SystemNotificationStatus) {
  return status === SystemNotificationStatus.DRAFT
    ? "草稿"
    : status === SystemNotificationStatus.PUBLISHED
      ? "已发布"
      : "已撤回";
}
function dateLabel(value: string | null) {
  return value ? value.slice(0, 10) : "—";
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    if (editing.value)
      await adminApi.updateNotification(editing.value.id, form);
    else await adminApi.createNotification(form.title, form.body);
    notice.value = "通知草稿已保存。";
    startCreate();
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
async function publish(item: AdminNotificationRecord) {
  busy.value = true;
  try {
    await adminApi.publishNotification(item.id);
    notice.value = "通知已发布。";
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
async function retract(item: AdminNotificationRecord) {
  busy.value = true;
  try {
    await adminApi.retractNotification(item.id);
    notice.value = "通知已撤回。";
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
async function deleteDraft(item: AdminNotificationRecord) {
  if (!window.confirm(`确认删除草稿“${item.title}”吗？`)) return;
  busy.value = true;
  try {
    await adminApi.deleteNotification(item.id);
    notice.value = "通知草稿已删除。";
    if (editing.value?.id === item.id) startCreate();
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  startCreate();
  void load();
});
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
    <div v-else class="notification-layout">
      <section class="panel editor-panel">
        <div class="section-heading">
          <div>
            <h2>{{ editing ? "编辑通知草稿" : "新建通知" }}</h2>
            <p>纯文本通知，发布后如需修改请新建一条。</p>
          </div>
          <el-button text type="info" @click="startCreate">清空</el-button>
        </div>
        <div class="field">
          <span>标题</span
          ><input
            v-model="form.title"
            :maxlength="SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH"
            placeholder="通知标题"
          />
        </div>
        <div class="field field--body">
          <span>正文</span
          ><textarea
            v-model="form.body"
            :maxlength="SYSTEM_NOTIFICATION_BODY_MAX_LENGTH"
            rows="14"
            placeholder="通知正文"
          />
        </div>
        <div v-if="error" class="operation-message operation-message--error">
          {{ error }}
        </div>
        <div v-if="notice" class="operation-message">{{ notice }}</div>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!form.title.trim() || !form.body.trim()"
          @click="save"
          >保存草稿</el-button
        >
      </section>
      <section class="panel notice-panel">
        <div class="toolbar">
          <label class="field"
            ><span>搜索</span
            ><input
              v-model="query"
              placeholder="标题或正文"
              @keyup.enter="load" /></label
          ><label class="field"
            ><span>状态</span
            ><el-select
              v-model="status"
              class="notification-status-select"
              @change="load"
              ><el-option label="全部" value="ALL" /><el-option
                label="草稿"
                :value="SystemNotificationStatus.DRAFT" /><el-option
                label="已发布"
                :value="SystemNotificationStatus.PUBLISHED" /><el-option
                label="已撤回"
                :value="
                  SystemNotificationStatus.RETRACTED
                " /></el-select></label
          ><el-button class="toolbar__action" :loading="loading" @click="load"
            >搜索</el-button
          >
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
          <el-table
            :data="items"
            class="notification-table"
            table-layout="fixed"
            border
            stripe
            ><el-table-column
              prop="title"
              label="通知标题"
              min-width="160"
              show-overflow-tooltip
            /><el-table-column
              label="发布人"
              min-width="100"
              show-overflow-tooltip
              ><template #default="{ row }">{{
                row.createdByAdminName || "未知管理员"
              }}</template></el-table-column
            ><el-table-column label="状态" width="90"
              ><template #default="{ row }">{{
                statusLabel(row.status)
              }}</template></el-table-column
            ><el-table-column label="创建日期" width="110"
              ><template #default="{ row }">{{
                dateLabel(row.createdAt)
              }}</template></el-table-column
            ><el-table-column label="操作" fixed="right" width="250"
              ><template #default="{ row }"
                ><div class="actions">
                  <el-button
                    size="small"
                    text
                    type="primary"
                    @click="openView(row)"
                    >查看</el-button
                  ><el-button
                    v-if="row.status === SystemNotificationStatus.DRAFT"
                    size="small"
                    text
                    type="primary"
                    @click="startEdit(row)"
                    >编辑</el-button
                  ><el-button
                    v-if="row.status === SystemNotificationStatus.DRAFT"
                    size="small"
                    text
                    type="success"
                    :loading="busy"
                    @click="publish(row)"
                    >发布</el-button
                  ><el-button
                    v-if="row.status === SystemNotificationStatus.DRAFT"
                    size="small"
                    text
                    type="danger"
                    :loading="busy"
                    @click="deleteDraft(row)"
                    >删除</el-button
                  ><el-button
                    v-if="row.status === SystemNotificationStatus.PUBLISHED"
                    size="small"
                    text
                    type="danger"
                    :loading="busy"
                    @click="retract(row)"
                    >撤回</el-button
                  >
                </div></template
              ></el-table-column
            ></el-table
          >
        </div>
      </section>
    </div>
    <el-drawer
      v-model="drawerOpen"
      title="查看通知"
      direction="rtl"
      size="min(520px, 92vw)"
    >
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
      <template #footer
        ><el-button @click="closeView">关闭</el-button></template
      >
    </el-drawer>
  </div>
</template>

<style scoped>
.notification-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: var(--space-4);
  align-items: stretch;
}
.editor-panel,
.notice-panel {
  min-height: 640px;
}
.notice-panel {
  display: flex;
  flex-direction: column;
}
.section-heading,
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.section-heading {
  justify-content: space-between;
}
.section-heading p {
  margin: 4px 0 16px;
  color: var(--color-muted);
  font-size: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.field span {
  font-size: 12px;
  color: var(--color-muted);
}
.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font: inherit;
}
.field--body textarea {
  min-height: 360px;
  resize: vertical;
}
.toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto;
  align-items: end;
  gap: var(--space-2);
}
.toolbar .field {
  margin-bottom: 0;
}
.toolbar__action {
  align-self: end;
}
.notification-status-select {
  width: 100%;
}
.notice-list {
  margin-top: var(--space-4);
  flex: 1;
  min-width: 0;
}
.notification-table {
  width: 100%;
}
.notification-table :deep(.el-table__cell) {
  padding: 10px 12px;
}
.notification-table :deep(.el-table__header-wrapper th) {
  color: var(--color-muted);
  background: var(--color-surface-soft);
  font-size: 11px;
}
.notification-table :deep(.el-table__fixed-right) {
  box-shadow: -8px 0 12px -8px rgba(16, 24, 40, 0.18);
}
.actions {
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 4px;
}
.actions .el-button {
  padding: 0 6px;
}
.notice-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-publisher,
.notice-status {
  color: var(--color-muted);
  font-size: 12px;
}
.operation-message {
  margin-bottom: 12px;
  color: var(--color-success);
}
.operation-message--error {
  color: var(--color-danger);
}
.notice-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 0 0 28px;
}
.notice-meta div {
  min-width: 0;
}
.notice-meta dt,
.notice-body > span {
  color: var(--color-muted);
  font-size: 12px;
}
.notice-meta dd {
  margin: 4px 0 0;
}
.notice-body {
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}
.notice-body p {
  margin: 12px 0 0;
  white-space: pre-wrap;
  line-height: 1.7;
}
.el-drawer :deep(.el-drawer__body) {
  padding: 24px;
}
.el-drawer :deep(.el-drawer__footer) {
  padding: 16px 24px;
}
@media (max-width: 1400px) {
  .notification-layout {
    grid-template-columns: 1fr;
  }
  .editor-panel,
  .notice-panel {
    min-height: auto;
  }
}
@media (max-width: 720px) {
  .toolbar {
    grid-template-columns: 1fr;
  }
  .toolbar__action {
    width: 100%;
  }
  .notification-table :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }
  .el-drawer {
    width: 100% !important;
  }
}
</style>
