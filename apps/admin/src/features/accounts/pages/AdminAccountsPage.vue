<script setup lang="ts">
import {
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
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { AdminPagination, AdminSearchInput, AdminTable, Icon, PageState, StatusBadge } from "@/shared/components";
import { useAdminAccountsPage } from "@/features/accounts/composables/useAdminAccountsPage";
import { formatDateTime } from "@/shared/utils/format";
import { roleLabels } from "@/shared/constants/labels";
import { accountFilterPlaceholders, accountStatusLabels } from "@/features/accounts/constants";
import type { Component } from "vue";
import type { AdminAccountRecord } from "@/shared/types";
import type { AdminTableColumn } from "@/shared/components";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

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
const {
  auth,
  allowed,
  query,
  roleFilter,
  statusFilter,
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  busy,
  notice,
  dialogMode,
  selected,
  activeEditors,
  setupLink,
  setupLinkOwner,
  copied,
  copiedLoginId,
  actionMenuAccount,
  actionMenuStyle,
  form,
  needsReplacement,
  dialogTitle,
  load,
  filter,
  resetFilters,
  go,
  changePageSize,
  toggleActions,
  openDialog,
  closeDialog,
  submit,
  copyLoginId,
  copySetupLink,
  closeSetupLink,
} = useAdminAccountsPage();

function statusLabel(status: AdminAccountStatus): string {
  return accountStatusLabels[status];
}

function statusTone(status: AdminAccountStatus): "success" | "danger" | "warning" {
  return status === AdminAccountStatus.ACTIVE
    ? "success"
    : status === AdminAccountStatus.SUSPENDED
      ? "danger"
      : "warning";
}
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
          <AdminSearchInput v-model="query" class="accounts-toolbar__search" :maxlength="LIST_QUERY_MAX_LENGTH" aria-label="搜索账号" :placeholder="accountFilterPlaceholders.query" @submit="filter" />
          <el-select v-model="roleFilter" class="admin-select" aria-label="账号角色" :placeholder="accountFilterPlaceholders.role" @change="filter"><el-option v-for="role in Object.values(AdminRole)" :key="role" :label="roleLabels[role]" :value="role" /></el-select>
          <el-select v-model="statusFilter" class="admin-select" aria-label="账号状态" :placeholder="accountFilterPlaceholders.status" @change="filter"><el-option v-for="status in Object.values(AdminAccountStatus)" :key="status" :label="accountStatusLabels[status]" :value="status" /></el-select>
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

<style scoped src="../styles/accounts.css"></style>
