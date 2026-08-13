<script setup lang="ts">
import { DramaStatus } from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { dramaStatusLabels, formatDateTime } from "@/i18n";
import type { DramaRecord } from "@/types/admin";

const items = ref<DramaRecord[]>([]);
const total = ref(0);
const query = ref("");
const status = ref("");
const loading = ref(true);
const error = ref("");

const toneByStatus = computed(() => ({
  [DramaStatus.DRAFT]: "neutral",
  [DramaStatus.UPLOADING]: "info",
  [DramaStatus.PROCESSING]: "info",
  [DramaStatus.PENDING_REVIEW]: "warning",
  [DramaStatus.PENDING_WECHAT]: "warning",
  [DramaStatus.READY]: "success",
  [DramaStatus.PUBLISHED]: "success",
  [DramaStatus.OFFLINE]: "danger",
  [DramaStatus.ARCHIVED]: "neutral",
} as const));

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listDramas(query.value, status.value);
    items.value = Array.isArray(result.items) ? result.items : [];
    total.value = Number.isFinite(result.total) ? result.total : items.value.length;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

function reset(): void {
  query.value = "";
  status.value = "";
  void load();
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header">
      <div><p class="eyebrow">CONTENT LIBRARY</p><h1>剧目管理</h1><p>维护元数据、版权许可、分集媒体与发布状态。</p></div>
      <RouterLink class="button button--primary" to="/dramas/new">＋ 新建剧目</RouterLink>
    </header>
    <section class="panel">
      <form class="toolbar" role="search" @submit.prevent="load">
        <label class="field"><span>关键词</span><input v-model="query" type="search" placeholder="搜索剧名或负责人" /></label>
        <label class="field"><span>内容状态</span><select v-model="status"><option value="">全部状态</option><option v-for="item in DramaStatus" :key="item" :value="item">{{ dramaStatusLabels[item] }}</option></select></label>
        <button class="button button--secondary" type="submit" :disabled="loading">筛选</button>
        <button class="button button--ghost" type="button" :disabled="loading" @click="reset">重置</button>
      </form>
      <PageState v-if="loading" type="loading" message="正在加载剧目列表…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState v-else-if="items.length === 0" type="empty" title="没有匹配的剧目" message="调整筛选条件，或创建第一部剧目。">
        <RouterLink class="button button--primary" to="/dramas/new">新建剧目</RouterLink>
      </PageState>
      <template v-else>
        <div class="list-summary">共 {{ total }} 部剧目</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>剧目</th><th>状态</th><th>负责人</th><th>集数</th><th>许可资料</th><th>最后更新</th><th><span class="sr-only">操作</span></th></tr></thead>
            <tbody>
              <tr v-for="drama in items" :key="drama.id">
                <td><span class="table-title"><strong>{{ drama.title || "未命名剧目" }}</strong><small>{{ drama.category || "未分类" }} · {{ drama.summary || "暂无简介" }}</small></span></td>
                <td><StatusBadge :label="dramaStatusLabels[drama.status]" :tone="toneByStatus[drama.status]" /></td>
                <td>{{ drama.ownerName || "—" }}</td>
                <td>{{ Array.isArray(drama.episodes) ? drama.episodes.length : 0 }}</td>
                <td><StatusBadge :label="drama.licenseNumber ? '已填写' : '待补齐'" :tone="drama.licenseNumber ? 'success' : 'warning'" /></td>
                <td>{{ formatDateTime(drama.updatedAt) }}</td>
                <td><RouterLink class="link" :to="`/dramas/${drama.id}`">查看 / 编辑</RouterLink></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.list-summary { margin: -4px 0 10px; color: var(--color-muted); font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
