<script setup lang="ts">
import {
  ADMIN_LIST_MAX_PAGE,
  ADMIN_WEB_PAGE_SIZE,
  ADMIN_DISPLAY_NAME_MAX_LENGTH,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  ADMIN_LOGIN_ID_MAX_LENGTH,
  ADMIN_LOGIN_ID_PATTERN_SOURCE,
  ASSIGNABLE_ADMIN_ROLES,
  LIST_QUERY_MAX_LENGTH,
  OTP_INPUT_LENGTH,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  isAdminLoginId,
  isAssignableAdminRole,
  isOwnedContentRole,
  type AssignableAdminRole,
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { accountManagementMessage } from "@/api/account-errors";
import { toErrorMessage } from "@/api/client";
import AdminTable from "@/components/AdminTable.vue";
import AdminPagination from "@/components/AdminPagination.vue";
import AdminSearchInput from "@/components/AdminSearchInput.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import Icon from "@/components/Icon.vue";
import { formatDateTime, roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type {
  AdminAccountRecord,
  AdminSetupLink,
} from "@/types/admin";
import type { AdminTableColumn } from "@/components/AdminTable.vue";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

type DialogMode = "create" | "edit" | "suspend" | "activate" | "invite" | "reset";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AdminAccountRecord[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(ADMIN_WEB_PAGE_SIZE);
const query = ref("");
const roleFilter = ref<AdminRole | "">("");
const statusFilter = ref<AdminAccountStatus | "">("");
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const dialogMode = ref<DialogMode | null>(null);
const selected = ref<AdminAccountRecord | null>(null);
const activeEditors = ref<AdminAccountRecord[]>([]);
const setupLink = ref<AdminSetupLink | null>(null);
const setupLinkOwner = ref("");
const copied = ref(false);
const copiedLoginId = ref("");
let copiedLoginTimer = 0;
const actionMenuAccount = ref<AdminAccountRecord | null>(null);
const actionMenuStyle = ref<{ top: string; right: string }>({ top: "0px", right: "0px" });
const form = reactive({
  displayName: "",
  email: "",
  role: AdminRole.EDITOR as AssignableAdminRole,
  otp: "",
  reason: "",
  replacementEditorId: "",
});
const accountColumns: AdminTableColumn[] = [
  { key: "identity", label: "姓名与登录名", minWidth: 280 },
  { key: "role", label: "角色", minWidth: 110 },
  { key: "status", label: "状态", minWidth: 100 },
  { key: "totp", label: "TOTP", minWidth: 100 },
  { key: "ownedDramaCount", label: "负责剧目", minWidth: 100 },
  { key: "lastLoginAt", label: "最后登录", minWidth: 180 },
  { key: "createdAt", label: "创建时间", minWidth: 180 },
];

function accountRoleLabel(role: AdminRole): string {
  return roleLabels[role] || "未知角色";
}

const isSelf = computed(() => selected.value?.id === auth.user?.id);
const needsReplacement = computed(() => {
  const account = selected.value;
  if (!account || !isOwnedContentRole(account.role) || account.ownedDramaCount < 1) return false;
  if (dialogMode.value === "suspend" || dialogMode.value === "reset") return true;
  return dialogMode.value === "edit" && !isOwnedContentRole(form.role);
});
const dialogTitle = computed(() => ({
  create: "新增管理员账号",
  edit: "编辑账号资料与角色",
  suspend: "停用管理员账号",
  activate: "启用管理员账号",
  invite: "重发开通链接",
  reset: "重置登录凭据",
}[dialogMode.value ?? "create"]));

function resetForm(): void {
  Object.assign(form, {
    displayName: "",
    email: "",
    role: AdminRole.EDITOR as AssignableAdminRole,
    otp: "",
    reason: "",
    replacementEditorId: "",
  });
}

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listAccounts(query.value, roleFilter.value, statusFilter.value, page.value, pageSize.value);
    items.value = Array.isArray(result.items) ? result.items : [];
    total.value = Number.isFinite(result.total) ? result.total : items.value.length;
  } catch (caught) {
    error.value = accountManagementMessage(caught) || toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function loadEditors(): Promise<void> {
  try {
    const editors: AdminAccountRecord[] = [];
    for (let editorPage = 1; editorPage <= ADMIN_LIST_MAX_PAGE; editorPage += 1) {
      const result = await adminApi.listAccounts(
        "",
        AdminRole.EDITOR,
        AdminAccountStatus.ACTIVE,
        editorPage,
      );
      editors.push(...result.items);
      if (result.items.length === 0 || editors.length >= result.total) break;
    }
    activeEditors.value = editors.filter((item) => item.id !== selected.value?.id);
  } catch {
    activeEditors.value = [];
  }
}

function filter(): void {
  page.value = 1;
  closeActions();
  void load();
}

function resetFilters(): void {
  query.value = "";
  roleFilter.value = "";
  statusFilter.value = "";
  page.value = 1;
  closeActions();
  void load();
}

function go(next: number): void {
  page.value = next;
  closeActions();
  void load();
}

function changePageSize(next: number): void {
  pageSize.value = next;
  page.value = 1;
  closeActions();
  void load();
}

function closeActions(): void {
  actionMenuAccount.value = null;
}

function toggleActions(account: AdminAccountRecord, event: MouseEvent): void {
  event.stopPropagation();
  if (actionMenuAccount.value?.id === account.id) {
    closeActions();
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  actionMenuAccount.value = account;
  actionMenuStyle.value = {
    top: `${Math.round(rect.bottom + 4)}px`,
    right: `${Math.round(window.innerWidth - rect.right)}px`,
  };
}

function openDialog(mode: DialogMode, account?: AdminAccountRecord): void {
  closeActions();
  resetForm();
  error.value = "";
  selected.value = account ?? null;
  dialogMode.value = mode;
  if (account) {
    form.displayName = account.displayName;
    form.email = account.email;
    form.role = isAssignableAdminRole(account.role) ? account.role : AdminRole.EDITOR;
    if (isOwnedContentRole(account.role) && account.ownedDramaCount > 0) void loadEditors();
  }
}

function closeDialog(): void {
  if (busy.value) return;
  dialogMode.value = null;
  selected.value = null;
  resetForm();
}

function formError(): string {
  if (dialogMode.value === "create" || dialogMode.value === "edit") {
    if (!form.displayName.trim()) return "请输入真实姓名";
  }
  if (dialogMode.value === "create") {
    if (!isAdminLoginId(form.email)) return "请输入登录名，例如 name 或 name@company.com";
  }
  if (!new RegExp(`^\\d{${OTP_INPUT_LENGTH}}$`).test(form.otp)) {
    return `请输入当前管理员的 ${OTP_INPUT_LENGTH} 位验证码`;
  }
  if (["create", "edit", "suspend", "activate", "invite", "reset"].includes(dialogMode.value ?? "")) {
    const length = form.reason.trim().length;
    if (length < ADMIN_REASON_MIN_LENGTH || length > ADMIN_REASON_MAX_LENGTH) {
      return `操作原因应为 ${ADMIN_REASON_MIN_LENGTH}–${ADMIN_REASON_MAX_LENGTH} 个字符`;
    }
  }
  if (needsReplacement.value && !form.replacementEditorId) return "请选择接替内容编辑";
  if (isSelf.value && ["suspend", "reset"].includes(dialogMode.value ?? "")) {
    return "不能对自己的账号执行此操作";
  }
  if (isSelf.value && dialogMode.value === "edit" && form.role !== selected.value?.role) {
    return "不能修改自己的角色";
  }
  return "";
}

async function submit(): Promise<void> {
  const validation = formError();
  if (validation) {
    error.value = validation;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    if (dialogMode.value === "create") {
      const result = await adminApi.createAccount({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        otp: form.otp,
        reason: form.reason.trim(),
      });
      setupLink.value = result;
      setupLinkOwner.value = form.displayName.trim();
      notice.value = "账号已创建，等待本人完成开通。";
    } else if (selected.value && dialogMode.value === "edit") {
      await adminApi.updateAccount(selected.value.id, {
        displayName: form.displayName.trim(),
        ...(form.role !== selected.value.role ? { role: form.role } : {}),
        ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
        otp: form.otp,
        reason: form.reason.trim(),
      });
      notice.value = "账号资料已更新；角色变化会要求目标账号重新登录。";
    } else if (selected.value && dialogMode.value === "suspend") {
      await adminApi.suspendAccount(selected.value.id, {
        reason: form.reason.trim(),
        ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
        otp: form.otp,
      });
      notice.value = "账号已停用，旧会话将立即失效。";
    } else if (selected.value && dialogMode.value === "activate") {
      await adminApi.activateAccount(selected.value.id, { reason: form.reason.trim(), otp: form.otp });
      notice.value = "账号已启用，将继续使用原登录凭据。";
    } else if (selected.value && (dialogMode.value === "invite" || dialogMode.value === "reset")) {
      const purpose = dialogMode.value === "invite"
        ? AdminSetupPurpose.INVITE
        : AdminSetupPurpose.CREDENTIAL_RESET;
      setupLink.value = await adminApi.createAccountSetupLink(selected.value.id, {
        purpose,
        reason: form.reason.trim(),
        ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
        otp: form.otp,
      });
      setupLinkOwner.value = selected.value.displayName;
      notice.value = purpose === AdminSetupPurpose.INVITE
        ? "新的开通链接已生成，旧链接已失效。"
        : "目标账号已暂停，旧会话和原凭据已失效。";
    }
    dialogMode.value = null;
    selected.value = null;
    resetForm();
    await load();
  } catch (caught) {
    error.value = accountManagementMessage(caught) || toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function copyLoginId(loginId: string, event: Event): Promise<void> {
  event.stopPropagation();
  try {
    await navigator.clipboard.writeText(loginId);
    copiedLoginId.value = loginId;
    window.clearTimeout(copiedLoginTimer);
    copiedLoginTimer = window.setTimeout(() => {
      if (copiedLoginId.value === loginId) copiedLoginId.value = "";
    }, 1500);
  } catch {
    error.value = "浏览器未允许复制，请手动选择登录名复制";
  }
}

async function copySetupLink(): Promise<void> {
  if (!setupLink.value) return;
  try {
    await navigator.clipboard.writeText(setupLink.value.setupUrl);
    copied.value = true;
  } catch {
    error.value = "浏览器未允许复制，请手动选择链接复制";
  }
}

function closeSetupLink(): void {
  setupLink.value = null;
  setupLinkOwner.value = "";
  copied.value = false;
}

function statusLabel(status: AdminAccountStatus): string {
  return status === AdminAccountStatus.ACTIVE
    ? "正常"
    : status === AdminAccountStatus.SUSPENDED
      ? "已停用"
      : "待开通";
}

function statusTone(status: AdminAccountStatus): "success" | "danger" | "warning" {
  return status === AdminAccountStatus.ACTIVE
    ? "success"
    : status === AdminAccountStatus.SUSPENDED
      ? "danger"
      : "warning";
}

function onDocumentPointerDown(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    closeActions();
    return;
  }
  if (target.closest(".account-actions-menu") || target.closest(".account-actions-trigger")) return;
  closeActions();
}

onMounted(() => {
  void load();
  window.addEventListener("resize", closeActions);
  window.addEventListener("scroll", closeActions, true);
  document.addEventListener("pointerdown", onDocumentPointerDown);
});
onBeforeUnmount(() => {
  window.clearTimeout(copiedLoginTimer);
  window.removeEventListener("resize", closeActions);
  window.removeEventListener("scroll", closeActions, true);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<template>
  <div class="accounts-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">ADMIN ACCOUNTS</p>
        <h1>账号管理</h1>
        <p>创建与维护管理员账号；不提供公开注册，也不删除历史账号。</p>
      </div>
      <div class="page-header__actions">
        <el-button class="button button--primary" native-type="button" :disabled="!allowed" @click="openDialog('create')">新增账号</el-button>
      </div>
    </header>

    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以管理后台账号。" />
    <template v-else>
      <div v-if="notice" class="operation-message" role="status">{{ notice }}</div>
      <div v-if="error && !dialogMode" class="operation-message operation-message--error" role="alert">{{ error }}</div>
      <section class="panel accounts-panel">
        <form class="toolbar accounts-toolbar" role="search" @submit.prevent="filter">
          <AdminSearchInput v-model="query" class="accounts-toolbar__search" :maxlength="LIST_QUERY_MAX_LENGTH" aria-label="搜索账号" placeholder="姓名或登录名" @submit="filter" />
          <el-select v-model="roleFilter" class="admin-select" aria-label="账号角色" placeholder="全部账号角色" @change="filter"><el-option v-for="role in Object.values(AdminRole)" :key="role" :label="roleLabels[role]" :value="role" /></el-select>
          <el-select v-model="statusFilter" class="admin-select" aria-label="账号状态" placeholder="全部账号状态" @change="filter"><el-option label="待开通" value="PENDING_SETUP" /><el-option label="正常" value="ACTIVE" /><el-option label="已停用" value="SUSPENDED" /></el-select>
          <el-button class="button button--secondary" native-type="button" :disabled="loading" @click="resetFilters">重置</el-button>
        </form>
        <PageState v-if="loading" type="loading" message="正在读取管理员账号…" />
        <PageState v-else-if="error && items.length === 0" type="error" :message="error" @retry="load" />
        <PageState v-else-if="items.length === 0" type="empty" title="没有匹配的管理员账号" message="请调整筛选条件，或新增账号。" />
        <template v-else>
          <AdminTable :rows="items" :columns="accountColumns" table-class="accounts-table" :action-width="80">
            <template #cell-identity="{ row }">
              <span class="table-title">
                <strong>{{ row.displayName }} <small v-if="row.id === auth.user?.id">（当前账号）</small></strong>
                <span class="account-login-id">
                  <small>{{ row.email }}</small>
                  <button
                    class="icon-button copy-login-id"
                    type="button"
                    :aria-label="copiedLoginId === row.email ? `${row.email} 已复制` : `复制登录名 ${row.email}`"
                    @click="copyLoginId(row.email, $event)"
                  >
                    <Icon :name="copiedLoginId === row.email ? 'check' : 'copy'" :size="14" />
                  </button>
                </span>
              </span>
            </template>
            <template #cell-role="{ row }">{{ accountRoleLabel(row.role) }}</template>
            <template #cell-status="{ row }"><StatusBadge :label="statusLabel(row.status)" :tone="statusTone(row.status)" /></template>
            <template #cell-totp="{ row }"><StatusBadge :label="row.totpEnabled ? '已绑定' : '待绑定'" :tone="row.totpEnabled ? 'success' : 'warning'" /></template>
            <template #cell-ownedDramaCount="{ row }">{{ row.ownedDramaCount }} 部</template>
            <template #cell-lastLoginAt="{ row }"><span class="nowrap">{{ formatDateTime(row.lastLoginAt) }}</span></template>
            <template #cell-createdAt="{ row }"><span class="nowrap">{{ formatDateTime(row.createdAt) }}</span></template>
            <template #actions="{ row }">
              <button
                class="link account-actions-trigger"
                type="button"
                :aria-expanded="actionMenuAccount?.id === row.id"
                aria-haspopup="menu"
                @click="toggleActions(row, $event)"
              >操作</button>
            </template>
          </AdminTable>
          <AdminPagination
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            :disabled="loading"
            @page-change="go"
            @page-size-change="changePageSize"
          />
        </template>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="actionMenuAccount" class="account-actions-menu" role="menu" :style="actionMenuStyle">
          <button type="button" role="menuitem" @click="openDialog('edit', actionMenuAccount)">编辑资料/角色</button>
          <button v-if="actionMenuAccount.status === 'PENDING_SETUP'" type="button" role="menuitem" @click="openDialog('invite', actionMenuAccount)">重发开通链接</button>
          <button v-if="actionMenuAccount.status === 'ACTIVE'" type="button" role="menuitem" :disabled="actionMenuAccount.id === auth.user?.id" @click="openDialog('suspend', actionMenuAccount)">停用</button>
          <button v-if="actionMenuAccount.status === 'SUSPENDED'" type="button" role="menuitem" @click="openDialog('activate', actionMenuAccount)">启用</button>
          <button v-if="actionMenuAccount.status !== 'PENDING_SETUP'" type="button" role="menuitem" :disabled="actionMenuAccount.id === auth.user?.id" @click="openDialog('reset', actionMenuAccount)">重置登录凭据</button>
        </div>
      <div v-if="dialogMode" class="dialog-backdrop" @keydown.esc="closeDialog">
        <form class="dialog account-dialog" role="dialog" aria-modal="true" :aria-labelledby="`${dialogMode}-title`" @submit.prevent="submit">
          <h2 :id="`${dialogMode}-title`">{{ dialogTitle }}</h2>
          <p v-if="selected">目标账号：{{ selected.displayName }}（{{ selected.email }}）</p>
          <template v-if="dialogMode === 'create' || dialogMode === 'edit'">
            <label class="field"><span>真实姓名 *</span><el-input v-model="form.displayName" class="admin-input" autocomplete="off" :maxlength="ADMIN_DISPLAY_NAME_MAX_LENGTH" required /></label>
            <label v-if="dialogMode === 'create'" class="field"><span>登录名 *</span><el-input v-model="form.email" class="admin-input" type="text" autocomplete="off" :maxlength="ADMIN_LOGIN_ID_MAX_LENGTH" :pattern="ADMIN_LOGIN_ID_PATTERN_SOURCE" required placeholder="name 或 name@company.com" /><small>只作登录标识，不会用来收发邮件；已有带 @ 的账号仍可登录。</small></label>
          <label class="field"><span>角色 *</span><el-select v-model="form.role" class="admin-select" aria-label="账号角色" placeholder="请选择账号角色" required><el-option v-for="role in ASSIGNABLE_ADMIN_ROLES" :key="role" :label="roleLabels[role]" :value="role" /></el-select></label>
          </template>
          <label v-if="['create', 'edit', 'suspend', 'activate', 'invite', 'reset'].includes(dialogMode)" class="field"><span>操作原因 *</span><el-input v-model="form.reason" class="admin-input" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required /></label>
          <div v-if="dialogMode === 'reset'" class="danger-note">重置后目标账号会立即暂停，旧密码、TOTP 和现有会话全部失效，直到本人通过新链接重新开通。</div>
          <label v-if="needsReplacement" class="field"><span>接替内容编辑（待移交 {{ selected?.ownedDramaCount }} 部剧目）*</span><el-select v-model="form.replacementEditorId" class="admin-select" aria-label="接替内容编辑" placeholder="请选择正常的内容编辑" required><el-option v-for="editor in activeEditors" :key="editor.id" :label="`${editor.displayName} · ${editor.email}`" :value="editor.id" /></el-select></label>
          <label class="field"><span>当前管理员 TOTP 验证码 *</span><el-input v-model="form.otp" class="admin-input" inputmode="numeric" autocomplete="one-time-code" :maxlength="OTP_INPUT_LENGTH" pattern="[0-9]*" required /></label>
          <div v-if="error" class="operation-message operation-message--error" role="alert">{{ error }}</div>
          <div class="dialog__actions"><el-button class="button button--ghost" native-type="button" :disabled="busy" @click="closeDialog">取消</el-button><el-button class="button" :class="['suspend', 'reset'].includes(dialogMode) ? 'button--danger' : 'button--primary'" native-type="submit" :disabled="busy">{{ busy ? '处理中…' : '确认' }}</el-button></div>
        </form>
      </div>

      <div v-if="setupLink" class="dialog-backdrop">
        <section class="dialog setup-link-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-link-title">
          <h2 id="setup-link-title">一次性{{ setupLink.purpose === 'INVITE' ? '开通' : '凭据重置' }}链接</h2>
          <p>请把链接安全地交给 {{ setupLinkOwner }}。链接关闭后不再显示，新的链接会使旧链接失效。</p>
          <label class="field"><span>链接（仅本次显示）</span><el-input :model-value="setupLink.setupUrl" class="admin-input" type="textarea" :rows="4" readonly @focus="($event.target as HTMLTextAreaElement).select()" /></label>
          <p>有效期至：<strong>{{ formatDateTime(setupLink.expiresAt) }}</strong></p>
          <div class="dialog__actions"><el-button class="button button--secondary" native-type="button" @click="copySetupLink">{{ copied ? '已复制' : '复制链接' }}</el-button><el-button class="button button--primary" native-type="button" @click="closeSetupLink">我已安全保存</el-button></div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.accounts-page { display: flex; min-height: calc(100dvh - 64px - 40px - 16px - 2 * var(--space-4)); flex-direction: column; }
.accounts-toolbar { align-items: center; gap: var(--space-2); }
.accounts-toolbar__search { flex: 0 1 var(--admin-list-search-width); width: var(--admin-list-search-width); min-width: 0; }
.accounts-toolbar > .admin-select { flex: 0 0 180px; width: 180px; }
.accounts-toolbar > .button { flex: 0 0 auto; }
.accounts-table :deep(.el-table) { min-width: 1040px; }
.nowrap { white-space: nowrap; }
.account-login-id { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.account-login-id small { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-login-id { width: 24px; height: 24px; color: var(--color-muted); }
.copy-login-id:hover { color: var(--color-text); background: rgba(102, 112, 133, 0.1); }
.account-actions-trigger { padding: 4px 2px; }
.account-actions-menu { position: fixed; z-index: 81; display: grid; width: 170px; padding: var(--space-1); border: 1px solid var(--color-border); border-radius: 9px; background: #fff; box-shadow: var(--shadow-md); }
.account-actions-menu button { padding: var(--space-2); border: 0; border-radius: 6px; text-align: left; color: #344054; background: transparent; cursor: pointer; }
.account-actions-menu button:hover:not(:disabled) { background: #f2f5f9; }
.account-actions-menu button:disabled { color: #a8b0bc; cursor: not-allowed; }
.account-dialog { display: grid; gap: var(--space-3); width: min(540px, 100%); max-height: calc(100vh - 36px); overflow-y: auto; }
.account-dialog h2, .account-dialog p, .setup-link-dialog h2 { margin-bottom: 0; }
.danger-note { padding: var(--space-2) var(--space-3); border-radius: 8px; color: #8f1f34; background: var(--color-danger-soft); font-size: 12px; line-height: 1.6; }
.setup-link-dialog { width: min(600px, 100%); }
.setup-link-dialog textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
@media (max-width: 760px) {
  .accounts-toolbar { align-items: stretch; flex-direction: column; }
  .accounts-toolbar__search,
  .accounts-toolbar > .admin-select,
  .accounts-toolbar > .button { flex-basis: auto; width: 100%; }
}
</style>
