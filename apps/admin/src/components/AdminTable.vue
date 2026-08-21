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
    tableClass?: string;
  }>(),
  { actionWidth: 230 },
);
</script>

<template>
  <el-table
    :data="rows"
    :class="['admin-table', tableClass]"
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
      label="操作"
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
</template>
