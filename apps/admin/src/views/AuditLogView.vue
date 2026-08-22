<script setup lang="ts">
import { ADMIN_WEB_PAGE_SIZE, AdminRole, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import AdminTable from "@/components/AdminTable.vue";
import AdminPagination from "@/components/AdminPagination.vue";
import AdminSearchInput from "@/components/AdminSearchInput.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { formatDateTime, roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { AuditLog } from "@/types/admin";
import type { AdminTableColumn } from "@/components/AdminTable.vue";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AuditLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(ADMIN_WEB_PAGE_SIZE);
const query = ref("");
const loading = ref(true);
const error = ref("");
const auditColumns: AdminTableColumn[] = [
  { key: "createdAt", label: "时间", minWidth: 180 },
  { key: "actor", label: "操作人", minWidth: 220 },
  { key: "action", label: "动作", minWidth: 180 },
  { key: "target", label: "目标", minWidth: 220 },
  { key: "result", label: "结果", minWidth: 100 },
  { key: "requestId", label: "请求编号", minWidth: 180 },
  { key: "detail", label: "说明", minWidth: 320 },
];

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listAuditLogs(query.value, page.value, pageSize.value);
    items.value = Array.isArray(result.items) ? result.items : [];
    total.value = Number.isFinite(result.total) ? result.total : items.value.length;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

function filter(): void {
  page.value = 1;
  void load();
}

function go(next: number): void {
  page.value = next;
  void load();
}

function changePageSize(next: number): void {
  pageSize.value = next;
  page.value = 1;
  void load();
}

function resultTone(result: AuditLog["result"]): "neutral" | "success" | "warning" | "danger" {
  return result === "SUCCESS"
    ? "success"
    : result === "DENIED"
      ? "warning"
      : result === "FAILED"
        ? "danger"
        : "neutral";
}

function resultLabel(result: AuditLog["result"]): string {
  return result === "SUCCESS" ? "成功" : result === "DENIED" ? "已拒绝" : result === "FAILED" ? "失败" : "未返回";
}

function actorRoleLabel(role: AdminRole | undefined): string {
  return role ? roleLabels[role] || "未知角色" : "角色未返回";
}

function contextDetail(item: AuditLog): string {
  const context = item.context;
  if (!context) return "";
  const parts = [
    context.dramaId ? `剧目 ${context.dramaId}` : "",
    context.episodeNumber !== undefined ? `第 ${context.episodeNumber} 集` : context.episodeId ? `集 ${context.episodeId}` : "",
    context.mediaVersion !== undefined ? `媒体 v${context.mediaVersion}` : "",
    context.uploadPhase ? `阶段 ${context.uploadPhase}` : "",
    context.fromStatus || context.toStatus ? `状态 ${context.fromStatus || "—"} → ${context.toStatus || "—"}` : "",
    context.reviewStatus ? `结论 ${context.reviewStatus}` : "",
    context.manualReviewStatus ? `人工 ${context.manualReviewStatus}` : "",
    context.wechatReviewStatus ? `微信 ${context.wechatReviewStatus}` : ""
  ];
  return parts.filter(Boolean).join(" · ");
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">AUDIT TRAIL</p><h1>审计日志</h1><p>查看关键管理动作及请求编号；日志内容不展示令牌或敏感请求体。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以查看全局审计日志。" />
    <section v-else class="panel">
      <form class="toolbar audit-toolbar" role="search" @submit.prevent="filter">
        <AdminSearchInput v-model="query" class="audit-toolbar__search" :maxlength="LIST_QUERY_MAX_LENGTH" aria-label="搜索审计记录" placeholder="请输入操作人、动作、目标或请求编号" @submit="filter" />
      </form>
      <PageState v-if="loading" type="loading" message="正在读取审计日志…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState v-else-if="items.length === 0 && total === 0" type="empty" title="没有匹配的审计记录" message="尝试清空关键词后重新搜索。" />
      <template v-else>
        <PageState v-if="items.length === 0" type="empty" title="这一页没有审计记录" message="请返回上一页，或重新搜索。" />
        <AdminTable v-else :rows="items" :columns="auditColumns" table-class="audit-table">
          <template #cell-createdAt="{ row }"><span class="nowrap">{{ formatDateTime(row.createdAt) }}</span></template>
          <template #cell-actor="{ row }"><span class="table-title"><strong>{{ row.actorName || "未知操作人" }}</strong><small>{{ actorRoleLabel(row.actorRole) }}</small></span></template>
          <template #cell-action="{ row }"><strong>{{ row.action }}</strong></template>
          <template #cell-target="{ row }">{{ row.target }}</template>
          <template #cell-result="{ row }"><StatusBadge :label="resultLabel(row.result)" :tone="resultTone(row.result)" /></template>
          <template #cell-requestId="{ row }"><code>{{ row.requestId || "—" }}</code></template>
          <template #cell-detail="{ row }">
            <div>{{ row.detail || "—" }}</div>
            <small v-if="contextDetail(row)" class="audit-context">{{ contextDetail(row) }}</small>
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

<style scoped>
.audit-toolbar { align-items: center; gap: var(--space-2); }
.audit-toolbar__search { flex: 0 1 var(--admin-list-search-width); width: var(--admin-list-search-width); min-width: 0; }
.nowrap { white-space: nowrap; }
.audit-table :deep(.el-table) { min-width: 1400px; }
code { padding: var(--space-1) var(--space-2); border-radius: 5px; color: #445269; background: #f1f3f6; font-size: 12px; }
.audit-context { display: block; margin-top: 3px; color: var(--color-muted); line-height: 1.4; }
@media (max-width: 760px) {
  .audit-toolbar { align-items: stretch; flex-direction: column; }
  .audit-toolbar__search { flex-basis: auto; width: 100%; }
}
</style>
