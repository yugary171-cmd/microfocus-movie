<script setup lang="ts">
import { DramaStatus, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import {
  ElButton as ElementButton,
  ElOption as ElementOption,
  ElSelect as ElementSelect,
} from "element-plus";
import { type Component } from "vue";
import { AdminPagination, AdminSearchInput, AdminTable, PageState, StatusBadge } from "@/shared/components";
import { DramaDetailDrawer } from "@/features/dramas/components";
import { dramaStatusLabels } from "@/shared/constants/labels";
import { formatDateTime } from "@/shared/utils/format";
import { dramaStatusTones } from "@/features/dramas/constants";
import { useDramaListPage } from "@/features/dramas/composables/useDramaListPage";
import type { DramaRecord } from "@/shared/types";
import type { AdminTableColumn } from "@/shared/components";

const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const {
  canCreateDrama,
  query,
  status,
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  detailOpen,
  detailLoading,
  detailError,
  selectedDrama,
  load,
  filter,
  reset,
  go,
  changePageSize,
  openDetail,
  closeDetail,
  retryDetail,
} = useDramaListPage();

const dramaColumns: AdminTableColumn[] = [
  { key: "title", label: "剧目", minWidth: 280 },
  { key: "status", label: "状态", minWidth: 100 },
  { key: "owner", label: "负责人", minWidth: 180 },
  { key: "episodes", label: "集数", minWidth: 80 },
  { key: "license", label: "许可资料", minWidth: 110 },
  { key: "updatedAt", label: "最后更新", minWidth: 180 },
];

function dramaStatusLabel(value: DramaStatus): string {
  return dramaStatusLabels[value] || "未知状态";
}

function dramaStatusTone(value: DramaStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  return dramaStatusTones[value];
}
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

<style scoped src="../styles/drama-list.css"></style>
