<script setup lang="ts">
import {
  ADMIN_LIST_PAGE_SIZE_OPTIONS,
  normalizeAdminWebPageSize,
  type AdminWebPageSize,
} from "@microfocus/contracts";
import { ElOption as ElementOption, ElPagination as ElementPagination, ElSelect as ElementSelect } from "element-plus";
import { type Component } from "vue";

const ElOption = ElementOption as Component;
const ElPagination = ElementPagination as Component;
const ElSelect = ElementSelect as Component;

withDefaults(defineProps<{
  currentPage: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  (event: "page-change", page: number): void;
  (event: "page-size-change", pageSize: AdminWebPageSize): void;
}>();

function changePageSize(value: number | string): void {
  emit("page-size-change", normalizeAdminWebPageSize(Number(value)));
}
</script>

<template>
  <div class="admin-pagination">
    <div class="admin-pagination__size">
      <span>每页显示：</span>
      <el-select
        :model-value="pageSize"
        class="admin-select admin-pagination__size-select"
        aria-label="每页显示条数"
        @change="changePageSize"
      >
        <el-option
          v-for="size in ADMIN_LIST_PAGE_SIZE_OPTIONS"
          :key="size"
          :label="String(size)"
          :value="size"
        />
      </el-select>
    </div>
    <el-pagination
      :current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      :disabled="disabled"
      layout="prev, pager, next"
      @current-change="emit('page-change', $event)"
    />
  </div>
</template>

<style scoped>
.admin-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 16px;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
}
.admin-pagination__size {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.admin-pagination__size-select { width: 72px; }
.admin-pagination :deep(.el-pagination) {
  --el-pagination-font-size: 12px;
  --el-pagination-button-size: 32px;
}
.admin-pagination :deep(.el-pager li),
.admin-pagination :deep(.btn-prev),
.admin-pagination :deep(.btn-next) {
  border-radius: 2px;
  font-size: 12px;
  font-weight: 500;
}
.admin-pagination :deep(.admin-pagination__size-select .el-select__wrapper) {
  border-radius: 2px;
}
@media (max-width: 720px) {
  .admin-pagination {
    justify-content: space-between;
    gap: 8px;
  }
  .admin-pagination__size {
    gap: 4px;
  }
}
</style>
