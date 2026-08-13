<script setup lang="ts">
import { AdminRole } from "@microfocus/contracts";
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
const query = ref("");
const loading = ref(true);
const error = ref("");

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listAuditLogs(query.value);
    items.value = Array.isArray(result.items) ? result.items : [];
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
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
      <form class="toolbar" role="search" @submit.prevent="load">
        <label class="field"><span>搜索审计记录</span><input v-model="query" type="search" placeholder="操作人、动作、目标或请求编号" /></label>
        <button class="button button--secondary" type="submit" :disabled="loading">搜索</button>
      </form>
      <PageState v-if="loading" type="loading" message="正在读取审计日志…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState v-else-if="items.length === 0" type="empty" title="没有匹配的审计记录" message="尝试清空关键词后重新搜索。" />
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
    </section>
  </div>
</template>

<style scoped>
.nowrap { white-space: nowrap; }
code { padding: 3px 6px; border-radius: 5px; color: #445269; background: #f1f3f6; font-size: 11px; }
</style>
