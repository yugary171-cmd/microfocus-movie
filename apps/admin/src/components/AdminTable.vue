<script setup lang="ts">
import {
  ElTable as ElementTable,
  ElTableColumn as ElementTableColumn,
} from "element-plus";
import { type Component } from "vue";

// Element Plus 2.14 exposes raw prop-definition types through SFCWithInstall;
// keep runtime component registration while avoiding false-positive template errors in vue-tsc.
const ElTable = ElementTable as Component;
const ElTableColumn = ElementTableColumn as Component;

export interface AdminTableColumn {
  key: string;
  label: string;
  prop?: string;
  width?: string | number;
  minWidth?: string | number;
  showOverflowTooltip?: boolean;
  formatter?: (row: Record<string, any>) => string;
}

withDefaults(
  defineProps<{
    rows: Record<string, any>[];
    columns: AdminTableColumn[];
    actionWidth?: string | number;
    actionLabel?: string;
    tableClass?: string;
  }>(),
  { actionWidth: 230, actionLabel: "操作" },
);
</script>

<template>
  <div :class="['admin-table-wrap', tableClass]">
    <el-table
      :data="rows"
      class="admin-table"
      table-layout="fixed"
      fit
      width="100%"
      style="width: 100%"
    >
      <el-table-column
        v-for="column in columns"
        :key="column.key"
        :prop="column.prop"
        :label="column.label"
        :width="column.width"
        :min-width="column.minWidth"
        :show-overflow-tooltip="column.showOverflowTooltip"
      >
        <template #default="{ row }">
          <slot :name="`cell-${column.key}`" :row="row" :column="column">
            {{ column.formatter ? column.formatter(row) : column.prop ? row[column.prop] : "" }}
          </slot>
        </template>
      </el-table-column>
      <el-table-column
        v-if="$slots.actions"
        :label="actionLabel"
        fixed="right"
        :width="actionWidth"
      >
        <template #default="{ row }">
          <div class="admin-table__actions">
            <slot name="actions" :row="row" />
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.admin-table-wrap {
  width: 100%;
  overflow-x: auto;
  background: #fff;
}
.admin-table {
  min-width: 100%;
  --el-table-header-bg-color: var(--table-head-bg-color);
  --el-table-text-color: var(--text-color);
  --el-table-header-text-color: var(--text-color);
  --el-table-border-color: var(--color-border);
  --el-table-row-hover-bg-color: var(--table-head-bg-color);
}
.admin-table :deep(.el-table__cell) {
  padding: 10px 12px;
  border-right: 0;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
}
.admin-table :deep(.el-table__header-wrapper th) {
  color: var(--text-color);
  background: var(--table-head-bg-color);
  font-size: 12px;
  font-weight: 500;
}
.admin-table :deep(.el-table__inner-wrapper::before),
.admin-table :deep(.el-table__fixed-right::before) {
  display: none;
}
.admin-table :deep(.el-table__fixed-right) {
  box-shadow: none;
}
.admin-table :deep(.el-table__fixed-right .el-table__cell) {
  background: #fff;
}
.admin-table :deep(.el-table__fixed-right .el-table__header-wrapper th) {
  background: var(--table-head-bg-color);
}
.admin-table :deep(.el-table__fixed-right .el-table__body tr:hover > td) {
  background: var(--table-head-bg-color);
}
.admin-table :deep(.el-table__body tr:last-child td) {
  border-bottom: 0;
}
.admin-table__actions {
  display: flex;
  gap: var(--space-2);
  white-space: nowrap;
}
</style>
