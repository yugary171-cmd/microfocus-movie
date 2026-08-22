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
  <div data-testid="admin-pagination" :class="$style['admin-pagination']">
    <div :class="$style['admin-pagination__size']">
      <span>每页显示：</span>
      <el-select
        :model-value="pageSize"
        data-testid="admin-pagination-size"
        :class="['admin-select', $style['admin-pagination__size-select']]"
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

<style module lang="scss" src="./AdminPagination.module.scss"></style>
