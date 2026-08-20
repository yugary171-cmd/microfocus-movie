<script setup lang="ts">
import { ADMIN_LIST_PAGE_SIZE, AdminRole, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { formatDateTime, roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { AuditLog } from "@/types/admin";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AuditLog[]>([]);
const total = ref(0);
const page = ref(1);
const query = ref("");
const loading = ref(true);
const error = ref("");
const totalPages = computed(() => Math.ceil(total.value / ADMIN_LIST_PAGE_SIZE));

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listAuditLogs(query.value, page.value);
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

function resultTone(result: AuditLog["result"]): "neutral" | "success" | "warning" | "danger" {
  return result === "SUCCESS"
    ? "success"
    : result === "DENIED"
      ? "warning"
      : result === "FAILED"
        ? "danger"
        : "neutral";
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">AUDIT TRAIL</p><h1>审计日志</h1><p>查看关键管理动作及请求编号；日志内容不展示令牌或敏感请求体。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以查看全局审计日志。" />
    <section v-else class="panel">
      <form class="toolbar" role="search" @submit.prevent="filter">
        <label class="field"><span>搜索审计记录</span><input v-model="query" type="search" :maxlength="LIST_QUERY_MAX_LENGTH" placeholder="操作人、动作、目标或请求编号" /></label>
        <button class="button button--secondary" type="submit" :disabled="loading">搜索</button>
      </form>
      <PageState v-if="loading" type="loading" message="正在读取审计日志…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState v-else-if="items.length === 0 && total === 0" type="empty" title="没有匹配的审计记录" message="尝试清空关键词后重新搜索。" />
      <template v-else>
        <div class="list-summary">第 {{ page }} 页 · 共 {{ total }} 条记录</div>
        <PageState v-if="items.length === 0" type="empty" title="这一页没有审计记录" message="请返回上一页，或重新搜索。" />
        <div v-else class="table-wrap">
          <table>
            <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>目标</th><th>结果</th><th>请求编号</th><th>说明</th></tr></thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td class="nowrap">{{ formatDateTime(item.createdAt) }}</td>
                <td><span class="table-title"><strong>{{ item.actorName || "未知操作人" }}</strong><small>{{ item.actorRole ? roleLabels[item.actorRole] : "角色未返回" }}</small></span></td>
                <td><strong>{{ item.action }}</strong></td>
                <td>{{ item.target }}</td>
                <td><StatusBadge :label="item.result === 'SUCCESS' ? '成功' : item.result === 'DENIED' ? '已拒绝' : item.result === 'FAILED' ? '失败' : '未返回'" :tone="resultTone(item.result)" /></td>
                <td><code>{{ item.requestId || "—" }}</code></td>
                <td>{{ item.detail || "—" }}</td>
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
  </div>
</template>

<style scoped>
.nowrap { white-space: nowrap; }
code { padding: var(--space-1) var(--space-2); border-radius: 5px; color: #445269; background: #f1f3f6; font-size: 11px; }
.list-summary { margin: 0 0 var(--space-2); color: var(--color-muted); font-size: 12px; }
.pager { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
</style>
