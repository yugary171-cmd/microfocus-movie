<script setup lang="ts">
import { AdminAccountStatus, AdminRole } from "@microfocus/contracts";
import { AdminPagination, AdminTable, Icon, StatusBadge, type AdminTableColumn } from "@/shared/components";
import { roleLabels } from "@/shared/constants/labels";
import { accountStatusLabels } from "@/features/accounts/constants";
import { formatDateTime } from "@/shared/utils/format";
import type { AdminAccountRecord } from "@/shared/types";

const props = defineProps<{
  rows: AdminAccountRecord[];
  authUserId: string | undefined;
  actionMenuAccountId: string | undefined;
  copiedLoginId: string;
  currentPage: number;
  pageSize: number;
  total: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  copy: [loginId: string, event: Event];
  toggle: [account: AdminAccountRecord, event: MouseEvent];
  "page-change": [page: number];
  "page-size-change": [pageSize: number];
}>();

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

function statusLabel(status: AdminAccountStatus): string {
  return accountStatusLabels[status];
}

function statusTone(status: AdminAccountStatus): "success" | "danger" | "warning" {
  return status === AdminAccountStatus.ACTIVE ? "success" : status === AdminAccountStatus.SUSPENDED ? "danger" : "warning";
}
</script>

<template>
  <AdminTable :rows="rows" :columns="accountColumns" :table-class="$style['accounts-table']" :action-width="80">
    <template #cell-identity="{ row }">
      <span class="table-title">
        <strong>{{ row.displayName }} <small v-if="row.id === authUserId">（当前账号）</small></strong>
        <span :class="$style['account-login-id']">
          <small>{{ row.email }}</small>
          <button
            :class="['icon-button', $style['copy-login-id']]"
            type="button"
            :aria-label="copiedLoginId === row.email ? `${row.email} 已复制` : `复制登录名 ${row.email}`"
            @click="emit('copy', row.email, $event)"
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
    <template #cell-lastLoginAt="{ row }"><span :class="$style.nowrap">{{ formatDateTime(row.lastLoginAt) }}</span></template>
    <template #cell-createdAt="{ row }"><span :class="$style.nowrap">{{ formatDateTime(row.createdAt) }}</span></template>
    <template #actions="{ row }">
      <button
        :class="['link', $style['account-actions-trigger']]"
        type="button"
        :aria-expanded="actionMenuAccountId === row.id"
        aria-haspopup="menu"
        @click="emit('toggle', row, $event)"
      >操作</button>
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
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
