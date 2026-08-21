<script setup lang="ts">
import {
  AdminRole,
  SYSTEM_NOTIFICATION_BODY_MAX_LENGTH,
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE,
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE_OPTIONS,
  SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH,
  SystemNotificationStatus,
  normalizeSystemNotificationAdminPageSize,
} from "@microfocus/contracts";
import {
  ElButton as ElementButton,
  ElDrawer as ElementDrawer,
  ElInput as ElementInput,
  ElMessage,
  ElOption as ElementOption,
  ElPagination as ElementPagination,
  ElSelect as ElementSelect,
} from "element-plus";
import { Check, CopyDocument } from "@element-plus/icons-vue";
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import AdminTable from "@/components/AdminTable.vue";
import PageState from "@/components/PageState.vue";
import { useAuthStore } from "@/stores/auth";
import type { AdminNotificationRecord } from "@/types/admin";
import type { AdminTableColumn } from "@/components/AdminTable.vue";

// Element Plus 2.14 exposes raw prop-definition types through SFCWithInstall;
// keep runtime component registration while avoiding false-positive template errors in vue-tsc.
const ElButton = ElementButton as Component;
const ElDrawer = ElementDrawer as Component;
const ElInput = ElementInput as Component;
const CheckIcon = Check as Component;
const CopyDocumentIcon = CopyDocument as Component;
const ElOption = ElementOption as Component;
const ElPagination = ElementPagination as Component;
const ElSelect = ElementSelect as Component;

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AdminNotificationRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const query = ref("");
const status = ref("ALL");
const editing = ref<AdminNotificationRecord | null>(null);
const viewing = ref<AdminNotificationRecord | null>(null);
const drawerOpen = ref(false);
const drawerMode = ref<"editor" | "view">("view");
const viewLoading = ref(false);
const form = reactive({ title: "", body: "" });
const copiedNotificationKey = ref("");
let copiedNotificationTimer: number | undefined;
const notificationColumns: AdminTableColumn[] = [
  {
    key: "title",
    prop: "title",
    label: "通知标题",
    minWidth: 240,
    showOverflowTooltip: true,
  },
  {
    key: "publisher",
    label: "发布人",
    minWidth: 180,
    showOverflowTooltip: true,
    formatter: (row) => row.createdByAdminName || "未知管理员",
  },
  {
    key: "status",
    label: "状态",
    minWidth: 90,
    formatter: (row) => statusLabel(row.status),
  },
  {
    key: "createdAt",
    label: "创建日期",
    minWidth: 160,
    formatter: (row) => dateLabel(row.createdAt),
  },
];
const drawerTitle = computed(() =>
  drawerMode.value === "editor"
    ? editing.value
      ? "编辑通知草稿"
      : "新建通知"
    : "查看通知",
);

function clearCopiedNotification() {
  if (copiedNotificationTimer !== undefined) {
    window.clearTimeout(copiedNotificationTimer);
    copiedNotificationTimer = undefined;
  }
}

async function copyNotificationValue(key: string, value: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
    await navigator.clipboard.writeText(value);
    clearCopiedNotification();
    copiedNotificationKey.value = key;
    copiedNotificationTimer = window.setTimeout(() => {
      copiedNotificationKey.value = "";
      copiedNotificationTimer = undefined;
    }, 1600);
    ElMessage({
      message: "复制成功",
      type: "success",
      customClass: "copy-success-message",
      duration: 1800,
    });
  } catch {
    ElMessage.error("复制失败，请检查浏览器剪贴板权限。");
  }
}

onBeforeUnmount(() => {
  clearCopiedNotification();
});

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
      page.value,
      pageSize.value,
    );
    items.value = Array.isArray(result.items) ? result.items : [];
    total.value = Number.isFinite(result.total) ? result.total : items.value.length;
    const lastPage = Math.max(1, Math.ceil(total.value / pageSize.value));
    if (page.value > lastPage) {
      page.value = lastPage;
      await load();
    }
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
function openEditor(item?: AdminNotificationRecord) {
  if (item) startEdit(item);
  else startCreate();
  drawerMode.value = "editor";
  drawerOpen.value = true;
}
async function openView(item: AdminNotificationRecord) {
  viewing.value = item;
  drawerMode.value = "view";
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
function closeDrawer() {
  drawerOpen.value = false;
}
function filter() {
  page.value = 1;
  void load();
}
function go(next: number) {
  page.value = next;
  void load();
}
function changePageSize(value: number | string) {
  pageSize.value = normalizeSystemNotificationAdminPageSize(Number(value));
  page.value = 1;
  void load();
}
function statusLabel(status: SystemNotificationStatus) {
  return status === SystemNotificationStatus.DRAFT
    ? "草稿"
    : status === SystemNotificationStatus.PUBLISHED
      ? "已发布"
      : "已撤回";
}
function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    closeDrawer();
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
    if (editing.value?.id === item.id) {
      startCreate();
      closeDrawer();
    }
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
    <section v-else class="panel notice-panel">
      <div v-if="error" class="operation-message operation-message--error">
        {{ error }}
      </div>
      <div v-if="notice" class="operation-message">{{ notice }}</div>
      <div class="toolbar">
        <el-button class="toolbar__new" type="primary" @click="openEditor()"
          >新建通知</el-button
        >
        <el-input
          v-model="query"
          class="toolbar__search admin-input"
          aria-label="搜索通知"
          placeholder="标题或正文"
          @keyup.enter="filter"
        />
        <el-select
          v-model="status"
          class="admin-select notification-status-select"
          aria-label="通知状态"
          @change="filter"
        >
          <el-option label="全部" value="ALL" />
          <el-option label="草稿" :value="SystemNotificationStatus.DRAFT" />
          <el-option
            label="已发布"
            :value="SystemNotificationStatus.PUBLISHED"
          />
          <el-option
            label="已撤回"
            :value="SystemNotificationStatus.RETRACTED"
          />
        </el-select>
        <el-button class="toolbar__action" @click="filter"
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
            <template #actions="{ row }">
              <div class="actions">
                <el-button size="small" text type="primary" @click="openView(row)">
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
        <div class="notification-pagination">
          <div class="notification-pagination__size">
            <span>每页显示：</span>
            <el-select
              :model-value="pageSize"
              class="admin-select notification-page-size-select"
              aria-label="每页显示条数"
              @change="changePageSize"
            >
              <el-option
                v-for="size in SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE_OPTIONS"
                :key="size"
                :label="String(size)"
                :value="size"
              />
            </el-select>
          </div>
          <el-pagination
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            :disabled="loading"
            layout="prev, pager, next"
            @current-change="go"
          />
        </div>
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
            rows="14"
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

<style scoped>
.notice-panel {
  display: flex;
  min-height: calc(100vh - 260px);
  flex-direction: column;
}
.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.drawer-description {
  margin: 0 0 var(--space-4);
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
.field > .admin-input {
  width: 100%;
  box-sizing: border-box;
}
.field--body .admin-input :deep(.el-textarea__inner) {
  min-height: 360px;
}
.toolbar {
  display: grid;
  grid-template-columns: auto minmax(240px, 0.5fr) 180px auto minmax(0, 0.5fr);
  align-items: center;
  gap: var(--space-2);
}
.toolbar__new {
  white-space: nowrap;
}
.toolbar__search {
  width: 100%;
  min-width: 0;
}
.notification-status-select { width: 180px; }
.toolbar__action {
  white-space: nowrap;
}
@media (max-width: 760px) {
  .toolbar { grid-template-columns: 1fr; }
  .toolbar__search, .notification-status-select { width: 100%; }
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
  --el-table-header-bg-color: var(--table-head-bg-color);
  --el-table-text-color: var(--text-color);
  --el-table-header-text-color: var(--text-color);
  --el-table-border-color: var(--color-border);
  --el-table-row-hover-bg-color: var(--table-head-bg-color);
}
.notification-table :deep(.el-table__cell) {
  padding: 10px 12px;
  border-right: 0;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
}
.notification-table :deep(.el-table__header-wrapper th) {
  color: var(--text-color);
  background: var(--table-head-bg-color);
  font-size: 12px;
  font-weight: 500;
}
.notification-table :deep(.el-table__inner-wrapper::before),
.notification-table :deep(.el-table__fixed-right::before) {
  display: none;
}
.notification-table :deep(.el-table__fixed-right) {
  box-shadow: none;
}
.actions {
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 0;
}
.actions .el-button {
  padding: 0;
}
.actions__divider {
  padding: 0 8px;
  color: var(--sls-normal-color-7);
  font-size: 12px;
  font-weight: 500;
}
.notification-cell {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  gap: 4px;
}
.notification-cell__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notification-copy {
  display: inline-grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  opacity: 0;
  visibility: hidden;
  transition: color var(--transition), background var(--transition), opacity var(--transition);
}
.notification-copy :deep(svg) {
  width: 14px;
  height: 14px;
}
.notification-cell:hover .notification-copy,
.notification-copy:focus-visible {
  opacity: 1;
  visibility: visible;
}
.notification-copy:hover {
  background: rgba(41, 82, 204, 0.08);
  color: var(--primary-color);
}
.notification-copy:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
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
.notification-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 16px;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
}
.notification-pagination__size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.notification-page-size-select {
  width: 72px;
}
.notification-pagination :deep(.el-pagination) {
  --el-pagination-font-size: 12px;
  --el-pagination-button-size: 32px;
}
.notification-pagination :deep(.el-pager li),
.notification-pagination :deep(.btn-prev),
.notification-pagination :deep(.btn-next) {
  font-size: 12px;
  font-weight: 500;
}
.el-drawer :deep(.el-drawer__body) {
  padding: 24px;
}
.el-drawer :deep(.el-drawer__footer) {
  padding: 16px 24px;
}
:global(.el-message.copy-success-message) {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  width: 120px;
  height: 41px;
  min-height: 41px;
  box-sizing: border-box;
  margin-top: 12px;
  overflow: hidden;
  padding: 0 8px 0 12px;
  border: 1px solid #c9cdd3;
  border-left: 7px solid #009b45;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(16, 24, 40, 0.18);
  color: #242933;
  font-size: 12px;
  font-weight: 400;
}
:global(.el-message.copy-success-message .el-message__icon) {
  flex: 0 0 auto;
  margin-right: 8px;
  color: #009b45;
  font-size: 18px;
}
:global(.el-message.copy-success-message .el-message__content) {
  min-width: 0;
  overflow: hidden;
  color: #242933;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}
@media (max-width: 720px) {
  .toolbar {
    grid-template-columns: 1fr;
  }
  .toolbar__new,
  .toolbar__search,
  .toolbar__action {
    width: 100%;
  }
  .notification-table :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }
  .notification-pagination {
    justify-content: space-between;
    gap: 8px;
  }
  .notification-pagination__size {
    gap: 4px;
  }
  :global(.el-drawer) {
    width: 100% !important;
  }
}
</style>
