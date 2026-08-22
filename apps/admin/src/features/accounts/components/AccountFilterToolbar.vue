<script setup lang="ts">
import { LIST_QUERY_MAX_LENGTH, AdminAccountStatus, AdminRole } from "@microfocus/contracts";
import { ElButton as ElementButton, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import type { Component } from "vue";
import { AdminSearchInput } from "@/shared/components";
import { roleLabels } from "@/shared/constants/labels";
import { accountFilterPlaceholders, accountStatusLabels } from "@/features/accounts/constants";

const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

defineProps<{
  query: string;
  roleFilter: AdminRole | "";
  statusFilter: AdminAccountStatus | "";
  loading: boolean;
}>();

const emit = defineEmits<{
  "update:query": [value: string];
  "update:role-filter": [value: AdminRole | ""];
  "update:status-filter": [value: AdminAccountStatus | ""];
  filter: [];
  reset: [];
}>();
</script>

<template>
  <form :class="['toolbar', $style['accounts-toolbar']]" role="search" @submit.prevent="emit('filter')">
    <AdminSearchInput
      :model-value="query"
      :class="$style['accounts-toolbar__search']"
      :maxlength="LIST_QUERY_MAX_LENGTH"
      aria-label="搜索账号"
      :placeholder="accountFilterPlaceholders.query"
      @update:model-value="emit('update:query', $event)"
      @submit="emit('filter')"
    />
    <el-select
      :model-value="roleFilter"
      class="admin-select"
      aria-label="账号角色"
      :placeholder="accountFilterPlaceholders.role"
      @update:model-value="emit('update:role-filter', $event)"
      @change="emit('filter')"
    >
      <el-option v-for="role in Object.values(AdminRole)" :key="role" :label="roleLabels[role]" :value="role" />
    </el-select>
    <el-select
      :model-value="statusFilter"
      class="admin-select"
      aria-label="账号状态"
      :placeholder="accountFilterPlaceholders.status"
      @update:model-value="emit('update:status-filter', $event)"
      @change="emit('filter')"
    >
      <el-option v-for="status in Object.values(AdminAccountStatus)" :key="status" :label="accountStatusLabels[status]" :value="status" />
    </el-select>
    <el-button class="button button--secondary" native-type="button" :disabled="loading" @click="emit('reset')">重置</el-button>
  </form>
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
