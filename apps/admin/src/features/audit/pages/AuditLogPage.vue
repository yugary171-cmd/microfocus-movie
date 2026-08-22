<script setup lang="ts">
import { AdminRole, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { AdminPagination, AdminSearchInput, AdminTable, PageState, StatusBadge } from "@/shared/components";
import { formatDateTime } from "@/shared/utils/format";
import { roleLabels } from "@/shared/constants/labels";
import { auditResultLabels, auditResultTones } from "@/features/audit/constants";
import { useAuditLogPage } from "@/features/audit/composables/useAuditLogPage";
import type { AuditLog } from "@/shared/types";
import type { AdminTableColumn } from "@/shared/components";

const {
  allowed,
  query,
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  load,
  filter,
  go,
  changePageSize,
  contextDetail,
} = useAuditLogPage();
const auditColumns: AdminTableColumn[] = [
  { key: "createdAt", label: "时间", minWidth: 180 },
  { key: "actor", label: "操作人", minWidth: 220 },
  { key: "action", label: "动作", minWidth: 180 },
  { key: "target", label: "目标", minWidth: 220 },
  { key: "result", label: "结果", minWidth: 100 },
  { key: "requestId", label: "请求编号", minWidth: 180 },
  { key: "detail", label: "说明", minWidth: 320 },
];

function resultTone(result: AuditLog["result"]): "neutral" | "success" | "warning" | "danger" {
  return auditResultTones[result];
}

function resultLabel(result: AuditLog["result"]): string {
  return auditResultLabels[result];
}

function actorRoleLabel(role: AdminRole | undefined): string {
  return role ? roleLabels[role] || "未知角色" : "角色未返回";
}
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">AUDIT TRAIL</p><h1>审计日志</h1><p>查看关键管理动作及请求编号；日志内容不展示令牌或敏感请求体。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以查看全局审计日志。" />
    <section v-else class="panel">
      <form :class="['toolbar', $style['audit-toolbar']]" role="search" @submit.prevent="filter">
        <AdminSearchInput v-model="query" :class="$style['audit-toolbar__search']" :maxlength="LIST_QUERY_MAX_LENGTH" aria-label="搜索审计记录" placeholder="请输入操作人、动作、目标或请求编号" @submit="filter" />
      </form>
      <PageState v-if="loading" type="loading" message="正在读取审计日志…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState v-else-if="items.length === 0 && total === 0" type="empty" title="没有匹配的审计记录" message="尝试清空关键词后重新搜索。" />
      <template v-else>
        <PageState v-if="items.length === 0" type="empty" title="这一页没有审计记录" message="请返回上一页，或重新搜索。" />
        <AdminTable v-else :rows="items" :columns="auditColumns" :table-class="$style['audit-table']">
          <template #cell-createdAt="{ row }"><span :class="$style.nowrap">{{ formatDateTime(row.createdAt) }}</span></template>
          <template #cell-actor="{ row }"><span class="table-title"><strong>{{ row.actorName || "未知操作人" }}</strong><small>{{ actorRoleLabel(row.actorRole) }}</small></span></template>
          <template #cell-action="{ row }"><strong>{{ row.action }}</strong></template>
          <template #cell-target="{ row }">{{ row.target }}</template>
          <template #cell-result="{ row }"><StatusBadge :label="resultLabel(row.result)" :tone="resultTone(row.result)" /></template>
          <template #cell-requestId="{ row }"><code>{{ row.requestId || "—" }}</code></template>
          <template #cell-detail="{ row }">
            <div>{{ row.detail || "—" }}</div>
            <small v-if="contextDetail(row)" :class="$style['audit-context']">{{ contextDetail(row) }}</small>
          </template>
        </AdminTable>
        <AdminPagination
          v-if="total > 0"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :disabled="loading"
          @page-change="go"
          @page-size-change="changePageSize"
        />
      </template>
    </section>
  </div>
</template>

<style module lang="scss" src="../styles/audit-log.module.scss"></style>
