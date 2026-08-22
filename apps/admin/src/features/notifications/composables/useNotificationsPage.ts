import {
  AdminRole,
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE,
  SystemNotificationStatus,
  normalizeSystemNotificationAdminPageSize,
} from "@microfocus/contracts";
import { ElMessage } from "element-plus";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { notificationsApi } from "@/features/notifications/api";
import { useAuthStore } from "@/infrastructure/stores";
import { useClipboard } from "@/shared/composables/useClipboard";
import { notificationActionMessages, notificationStatusLabels } from "@/features/notifications/constants";
import { formatDateTimeSeconds } from "@/shared/utils/format";
import type { AdminNotificationRecord } from "@/shared/types";
import type { AdminTableColumn } from "@/shared/components";

export function useNotificationsPage() {
  const auth = useAuthStore();
const { copy } = useClipboard();
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
    minWidth: 190,
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
    await copy(value);
    clearCopiedNotification();
    copiedNotificationKey.value = key;
    copiedNotificationTimer = window.setTimeout(() => {
      copiedNotificationKey.value = "";
      copiedNotificationTimer = undefined;
    }, 1600);
    ElMessage({
      message: notificationActionMessages.copied,
      type: "success",
      customClass: "copy-success-message",
      duration: 1800,
    });
  } catch {
    ElMessage.error(notificationActionMessages.copyFailed);
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
    const result = await notificationsApi.listNotifications(
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
    viewing.value = await notificationsApi.getNotification(item.id);
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
  return notificationStatusLabels[status];
}
function dateLabel(value: string | null) {
  return formatDateTimeSeconds(value);
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    if (editing.value)
      await notificationsApi.updateNotification(editing.value.id, form);
    else await notificationsApi.createNotification(form.title, form.body);
    notice.value = notificationActionMessages.saved;
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
    await notificationsApi.publishNotification(item.id);
    notice.value = notificationActionMessages.published;
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
    await notificationsApi.retractNotification(item.id);
    notice.value = notificationActionMessages.retracted;
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
    await notificationsApi.deleteNotification(item.id);
    notice.value = notificationActionMessages.deleted;
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
onBeforeUnmount(clearCopiedNotification);

return {
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
  load,
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
};
}
