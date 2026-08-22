<script setup lang="ts">
import {
  DRAMA_ADMIN_PAGE_SIZE,
  DramaStatus,
  LIST_QUERY_MAX_LENGTH,
  isContentOperator,
  normalizeAdminWebPageSize,
} from "@microfocus/contracts";
import {
  ElButton as ElementButton,
  ElOption as ElementOption,
  ElSelect as ElementSelect,
} from "element-plus";
import { computed, onMounted, ref, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import AdminTable from "@/components/AdminTable.vue";
import AdminPagination from "@/components/AdminPagination.vue";
import AdminSearchInput from "@/components/AdminSearchInput.vue";
import DramaDetailDrawer from "@/components/DramaDetailDrawer.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { dramaStatusLabels, formatDateTime } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { DramaRecord } from "@/types/admin";
import type { AdminTableColumn } from "@/components/AdminTable.vue";

const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const auth = useAuthStore();
const canCreateDrama = computed(() => Boolean(auth.user && isContentOperator(auth.user.role)));

const items = ref<DramaRecord[]>([]);
const total = ref(0);
const page = ref(1);
const query = ref("");
const status = ref("");
const pageSize = ref(DRAMA_ADMIN_PAGE_SIZE);
const loading = ref(true);
const error = ref("");
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref("");
const selectedDrama = ref<DramaRecord | null>(null);
let detailRequestId = 0;
const dramaColumns: AdminTableColumn[] = [
  { key: "title", label: "剧目", minWidth: 280 },
  { key: "status", label: "状态", minWidth: 100 },
  { key: "owner", label: "负责人", minWidth: 180 },
  { key: "episodes", label: "集数", minWidth: 80 },
  { key: "license", label: "许可资料", minWidth: 110 },
  { key: "updatedAt", label: "最后更新", minWidth: 180 },
];

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

function dramaStatusLabel(status: DramaStatus): string {
  return dramaStatusLabels[status] || "未知状态";
}

function dramaStatusTone(status: DramaStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  return toneByStatus.value[status];
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listDramas(query.value, status.value, page.value, pageSize.value);
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

function reset(): void {
  query.value = "";
  status.value = "";
  page.value = 1;
  void load();
}

function go(next: number): void {
  page.value = next;
  void load();
}

function changePageSize(value: number | string): void {
  pageSize.value = normalizeAdminWebPageSize(Number(value));
  page.value = 1;
  void load();
}

async function openDetail(drama: DramaRecord): Promise<void> {
  const requestId = ++detailRequestId;
  selectedDrama.value = drama;
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = "";
  try {
    const detail = await adminApi.getDrama(drama.id);
    if (requestId === detailRequestId) selectedDrama.value = detail;
  } catch (caught) {
    if (requestId === detailRequestId) detailError.value = toErrorMessage(caught);
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

function closeDetail(): void {
  detailRequestId += 1;
  detailOpen.value = false;
  detailLoading.value = false;
  detailError.value = "";
  selectedDrama.value = null;
}

function retryDetail(): void {
  if (selectedDrama.value) void openDetail(selectedDrama.value);
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">CONTENT LIBRARY</p>
        <h1>剧目管理</h1>
        <p>维护元数据、版权许可、分集媒体与发布状态。</p>
      </div>
    </header>
    <section class="panel">
      <form class="toolbar drama-toolbar" role="search" @submit.prevent="filter">
        <RouterLink v-if="canCreateDrama" class="button button--primary drama-toolbar__new" to="/dramas/new">新建剧目</RouterLink>
        <label class="field admin-list-search-field"><AdminSearchInput v-model="query" :maxlength="LIST_QUERY_MAX_LENGTH" aria-label="搜索剧名或负责人" placeholder="搜索剧名或负责人" @submit="filter" /></label>
        <label class="field"><el-select v-model="status" class="admin-select" aria-label="内容状态" placeholder="请选择内容状态" @change="filter"><el-option v-for="item in DramaStatus" :key="item" :label="dramaStatusLabels[item]" :value="item" /></el-select></label>
        <el-button class="button button--secondary" native-type="button" :disabled="loading" @click="reset">重置</el-button>
      </form>
      <PageState v-if="loading" type="loading" message="正在加载剧目列表…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <PageState
        v-else-if="items.length === 0 && total === 0"
        type="empty"
        title="没有匹配的剧目"
        message="调整筛选条件，或创建第一部剧目。"
      >
        <RouterLink v-if="canCreateDrama" class="button button--primary" to="/dramas/new">新建剧目</RouterLink>
      </PageState>
      <template v-else>
        <PageState v-if="items.length === 0" type="empty" title="这一页没有剧目" message="请返回上一页，或重新筛选。" />
        <AdminTable v-else :rows="items" :columns="dramaColumns" table-class="drama-table" :action-width="120" action-label="">
          <template #cell-title="{ row }">
            <span class="table-title"><strong>{{ row.title || "未命名剧目" }}</strong><small>{{ row.category || "未分类" }} · {{ row.summary || "暂无简介" }}</small></span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :label="dramaStatusLabel(row.status)" :tone="dramaStatusTone(row.status)" />
          </template>
          <template #cell-owner="{ row }">{{ row.ownerName || "—" }}</template>
          <template #cell-episodes="{ row }">{{ Array.isArray(row.episodes) ? row.episodes.length : 0 }}</template>
          <template #cell-license="{ row }">
            <StatusBadge :label="row.licenseNumber ? '已填写' : '待补齐'" :tone="row.licenseNumber ? 'success' : 'warning'" />
          </template>
          <template #cell-updatedAt="{ row }"><span class="nowrap">{{ formatDateTime(row.updatedAt) }}</span></template>
          <template #actions="{ row }">
            <div class="drama-actions">
              <button class="link" type="button" @click="openDetail(row)">查看</button>
              <span class="drama-actions__divider" aria-hidden="true">|</span>
              <RouterLink class="link" :to="`/dramas/${row.id}`">编辑</RouterLink>
            </div>
          </template>
        </AdminTable>
        <div v-if="total > 0" class="drama-pagination">
          <AdminPagination
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            :disabled="loading"
            @page-change="go"
            @page-size-change="changePageSize"
          />
        </div>
      </template>
    </section>
    <DramaDetailDrawer
      :open="detailOpen"
      :drama="selectedDrama"
      :loading="detailLoading"
      :error="detailError"
      @close="closeDetail"
      @retry="retryDetail"
    />
  </div>
</template>

<style scoped>
.drama-toolbar { gap: var(--space-2); margin-bottom: var(--space-2); }
.drama-toolbar > .field:last-of-type { flex: 0 0 180px; }
.drama-pagination {
  margin-top: 0;
}
.nowrap { white-space: nowrap; }
.drama-actions { white-space: nowrap; }
.drama-actions__divider { padding: 0 8px; color: var(--sls-normal-color-7); font-size: 12px; font-weight: 500; }
@media (max-width: 760px) {
  .drama-toolbar > .field:first-of-type,
  .drama-toolbar > .field:last-of-type { flex: 0 0 auto; width: 100%; }
}
</style>
