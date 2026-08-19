<script setup lang="ts">
import {
  ADMIN_LIST_PAGE_SIZE,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_DISPLAY_NAME_MAX_LENGTH,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  LIST_QUERY_MAX_LENGTH,
  OTP_INPUT_LENGTH,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
} from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { adminApi } from "@/api/admin";
import { accountManagementMessage } from "@/api/account-errors";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { formatDateTime, roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type {
  AdminAccountRecord,
  AdminSetupLink,
} from "@/types/admin";

type DialogMode = "create" | "edit" | "suspend" | "activate" | "invite" | "reset";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AdminAccountRecord[]>([]);
const total = ref(0);
const page = ref(1);
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
const form = reactive({
  displayName: "",
  email: "",
  role: AdminRole.EDITOR,
  otp: "",
  reason: "",
  replacementEditorId: "",
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / ADMIN_LIST_PAGE_SIZE)));
const isSelf = computed(() => selected.value?.id === auth.user?.id);
const needsReplacement = computed(() => {
  const account = selected.value;
  if (!account || account.role !== AdminRole.EDITOR || account.ownedDramaCount < 1) return false;
  if (dialogMode.value === "suspend" || dialogMode.value === "reset") return true;
  return dialogMode.value === "edit" && form.role !== AdminRole.EDITOR;
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
    role: AdminRole.EDITOR,
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
    const result = await adminApi.listAccounts(query.value, roleFilter.value, statusFilter.value, page.value);
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
  void load();
}

function clearFilters(): void {
  query.value = "";
  roleFilter.value = "";
  statusFilter.value = "";
  page.value = 1;
  void load();
}

function go(next: number): void {
  page.value = next;
  void load();
}

function openDialog(mode: DialogMode, account?: AdminAccountRecord): void {
  resetForm();
  error.value = "";
  selected.value = account ?? null;
  dialogMode.value = mode;
  if (account) {
    form.displayName = account.displayName;
    form.email = account.email;
    form.role = account.role;
    if (account.role === AdminRole.EDITOR && account.ownedDramaCount > 0) void loadEditors();
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
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim())) return "请输入有效邮箱";
  }
  if (!new RegExp(`^\\d{${OTP_INPUT_LENGTH}}$`).test(form.otp)) {
    return `请输入当前管理员的 ${OTP_INPUT_LENGTH} 位验证码`;
  }
  if (["suspend", "activate", "invite", "reset"].includes(dialogMode.value ?? "")) {
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
      });
      setupLink.value = result;
      setupLinkOwner.value = form.displayName.trim();
      notice.value = "账号已创建，等待本人完成开通。";
    } else if (selected.value && dialogMode.value === "edit") {
      await adminApi.updateAccount(selected.value.id, {
        displayName: form.displayName.trim(),
        role: form.role,
        ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
        otp: form.otp,
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

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">ADMIN ACCOUNTS</p>
        <h1>账号管理</h1>
        <p>创建与维护管理员账号；不提供公开注册，也不删除历史账号。</p>
      </div>
      <div class="page-header__actions">
        <button class="button button--primary" type="button" :disabled="!allowed" @click="openDialog('create')">新增账号</button>
      </div>
    </header>

    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以管理后台账号。" />
    <template v-else>
      <div v-if="notice" class="operation-message" role="status">{{ notice }}</div>
      <div v-if="error && !dialogMode" class="operation-message operation-message--error" role="alert">{{ error }}</div>
      <section class="panel">
        <form class="toolbar" role="search" @submit.prevent="filter">
          <label class="field"><span>搜索账号</span><input v-model="query" type="search" :maxlength="LIST_QUERY_MAX_LENGTH" placeholder="姓名或邮箱" /></label>
          <label class="field"><span>角色</span><select v-model="roleFilter"><option value="">全部角色</option><option v-for="role in Object.values(AdminRole)" :key="role" :value="role">{{ roleLabels[role] }}</option></select></label>
          <label class="field"><span>状态</span><select v-model="statusFilter"><option value="">全部状态</option><option value="PENDING_SETUP">待开通</option><option value="ACTIVE">正常</option><option value="SUSPENDED">已停用</option></select></label>
          <button class="button button--secondary" type="submit" :disabled="loading">筛选</button>
          <button class="button button--ghost" type="button" :disabled="loading" @click="clearFilters">清空</button>
        </form>
        <PageState v-if="loading" type="loading" message="正在读取管理员账号…" />
        <PageState v-else-if="error && items.length === 0" type="error" :message="error" @retry="load" />
        <PageState v-else-if="items.length === 0" type="empty" title="没有匹配的管理员账号" message="请调整筛选条件，或新增账号。" />
        <template v-else>
          <div class="list-summary">第 {{ page }} 页 · 共 {{ total }} 个账号</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>姓名与邮箱</th><th>角色</th><th>状态</th><th>TOTP</th><th>负责剧目</th><th>最后登录</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="account in items" :key="account.id">
                  <td><span class="table-title"><strong>{{ account.displayName }} <small v-if="account.id === auth.user?.id">（当前账号）</small></strong><small>{{ account.email }}</small></span></td>
                  <td>{{ roleLabels[account.role] }}</td>
                  <td><StatusBadge :label="statusLabel(account.status)" :tone="statusTone(account.status)" /></td>
                  <td><StatusBadge :label="account.totpEnabled ? '已绑定' : '待绑定'" :tone="account.totpEnabled ? 'success' : 'warning'" /></td>
                  <td>{{ account.ownedDramaCount }} 部</td>
                  <td class="nowrap">{{ formatDateTime(account.lastLoginAt) }}</td>
                  <td class="nowrap">{{ formatDateTime(account.createdAt) }}</td>
                  <td>
                    <details class="account-actions">
                      <summary>操作</summary>
                      <div>
                        <button type="button" @click="openDialog('edit', account)">编辑资料/角色</button>
                        <button v-if="account.status === 'PENDING_SETUP'" type="button" @click="openDialog('invite', account)">重发开通链接</button>
                        <button v-if="account.status === 'ACTIVE'" type="button" :disabled="account.id === auth.user?.id" @click="openDialog('suspend', account)">停用</button>
                        <button v-if="account.status === 'SUSPENDED'" type="button" @click="openDialog('activate', account)">启用</button>
                        <button v-if="account.status !== 'PENDING_SETUP'" type="button" :disabled="account.id === auth.user?.id" @click="openDialog('reset', account)">重置登录凭据</button>
                      </div>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="totalPages > 1 || page > 1" class="pager">
            <button class="button button--ghost" type="button" :disabled="loading || page <= 1" @click="go(page - 1)">上一页</button>
            <button class="button button--ghost" type="button" :disabled="loading || page >= totalPages" @click="go(page + 1)">下一页</button>
          </div>
        </template>
      </section>
    </template>

    <Teleport to="body">
      <div v-if="dialogMode" class="dialog-backdrop" @keydown.esc="closeDialog">
        <form class="dialog account-dialog" role="dialog" aria-modal="true" :aria-labelledby="`${dialogMode}-title`" @submit.prevent="submit">
          <h2 :id="`${dialogMode}-title`">{{ dialogTitle }}</h2>
          <p v-if="selected">目标账号：{{ selected.displayName }}（{{ selected.email }}）</p>
          <template v-if="dialogMode === 'create' || dialogMode === 'edit'">
            <label class="field"><span>真实姓名 *</span><input v-model="form.displayName" autocomplete="off" :maxlength="ADMIN_DISPLAY_NAME_MAX_LENGTH" required /></label>
            <label v-if="dialogMode === 'create'" class="field"><span>邮箱（登录名）*</span><input v-model="form.email" type="email" autocomplete="off" :maxlength="EMAIL_MAX_LENGTH" required /></label>
            <label class="field"><span>角色 *</span><select v-model="form.role"><option v-for="role in Object.values(AdminRole)" :key="role" :value="role">{{ roleLabels[role] }}</option></select></label>
          </template>
          <label v-if="['suspend', 'activate', 'invite', 'reset'].includes(dialogMode)" class="field"><span>操作原因 *</span><textarea v-model="form.reason" rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required /></label>
          <div v-if="dialogMode === 'reset'" class="danger-note">重置后目标账号会立即暂停，旧密码、TOTP 和现有会话全部失效，直到本人通过新链接重新开通。</div>
          <label v-if="needsReplacement" class="field"><span>接替内容编辑（待移交 {{ selected?.ownedDramaCount }} 部剧目）*</span><select v-model="form.replacementEditorId" required><option value="">请选择正常的内容编辑</option><option v-for="editor in activeEditors" :key="editor.id" :value="editor.id">{{ editor.displayName }} · {{ editor.email }}</option></select></label>
          <label class="field"><span>当前管理员 TOTP 验证码 *</span><input v-model="form.otp" inputmode="numeric" autocomplete="one-time-code" :maxlength="OTP_INPUT_LENGTH" pattern="[0-9]*" required /></label>
          <div v-if="error" class="operation-message operation-message--error" role="alert">{{ error }}</div>
          <div class="dialog__actions"><button class="button button--ghost" type="button" :disabled="busy" @click="closeDialog">取消</button><button class="button" :class="['suspend', 'reset'].includes(dialogMode) ? 'button--danger' : 'button--primary'" type="submit" :disabled="busy">{{ busy ? '处理中…' : '确认' }}</button></div>
        </form>
      </div>

      <div v-if="setupLink" class="dialog-backdrop">
        <section class="dialog setup-link-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-link-title">
          <h2 id="setup-link-title">一次性{{ setupLink.purpose === 'INVITE' ? '开通' : '凭据重置' }}链接</h2>
          <p>请把链接安全地交给 {{ setupLinkOwner }}。链接关闭后不再显示，新的链接会使旧链接失效。</p>
          <label class="field"><span>链接（仅本次显示）</span><textarea :value="setupLink.setupUrl" rows="4" readonly @focus="($event.target as HTMLTextAreaElement).select()" /></label>
          <p>有效期至：<strong>{{ formatDateTime(setupLink.expiresAt) }}</strong></p>
          <div class="dialog__actions"><button class="button button--secondary" type="button" @click="copySetupLink">{{ copied ? '已复制' : '复制链接' }}</button><button class="button button--primary" type="button" @click="closeSetupLink">我已安全保存</button></div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.list-summary { margin: -4px 0 10px; color: var(--color-muted); font-size: 12px; }
.pager { display: flex; gap: 8px; margin-top: 12px; }
.nowrap { white-space: nowrap; }
.account-actions { position: relative; }
.account-actions summary { cursor: pointer; color: var(--color-primary); font-weight: 700; list-style: none; }
.account-actions summary::-webkit-details-marker { display: none; }
.account-actions > div { position: absolute; z-index: 8; right: 0; display: grid; width: 170px; padding: 6px; border: 1px solid var(--color-border); border-radius: 9px; background: #fff; box-shadow: var(--shadow-md); }
.account-actions button { padding: 8px 9px; border: 0; border-radius: 6px; text-align: left; color: #344054; background: transparent; cursor: pointer; }
.account-actions button:hover:not(:disabled) { background: #f2f5f9; }
.account-actions button:disabled { color: #a8b0bc; cursor: not-allowed; }
.account-dialog { display: grid; gap: 14px; width: min(540px, 100%); max-height: calc(100vh - 36px); overflow-y: auto; }
.account-dialog h2, .account-dialog p, .setup-link-dialog h2 { margin-bottom: 0; }
.danger-note { padding: 10px 12px; border-radius: 8px; color: #8f1f34; background: var(--color-danger-soft); font-size: 12px; line-height: 1.6; }
.setup-link-dialog { width: min(600px, 100%); }
.setup-link-dialog textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
@media (max-width: 720px) {
  .account-actions > div { right: auto; left: 0; }
}
</style>
