<script setup lang="ts">
import { ElButton as ElementButton } from "element-plus";
import type { Component } from "vue";
import { PageState } from "@/shared/components";
import {
  AccountActionsMenu,
  AccountDialog,
  AccountFilterToolbar,
  AccountTable,
  SetupLinkDialog,
} from "@/features/accounts/components";
import { useAdminAccountsPage } from "@/features/accounts/composables/useAdminAccountsPage";

const ElButton = ElementButton as Component;

const {
  auth,
  allowed,
  query,
  roleFilter,
  statusFilter,
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  busy,
  notice,
  dialogMode,
  selected,
  activeEditors,
  setupLink,
  setupLinkOwner,
  copied,
  copiedLoginId,
  actionMenuAccount,
  actionMenuStyle,
  form,
  needsReplacement,
  dialogTitle,
  load,
  filter,
  resetFilters,
  go,
  changePageSize,
  toggleActions,
  openDialog,
  closeDialog,
  submit,
  copyLoginId,
  copySetupLink,
  closeSetupLink,
} = useAdminAccountsPage();
</script>

<template>
  <div :class="$style['accounts-page']">
    <header class="page-header">
      <div>
        <p class="eyebrow">ADMIN ACCOUNTS</p>
        <h1>账号管理</h1>
        <p>创建与维护管理员账号；不提供公开注册，也不删除历史账号。</p>
      </div>
      <div class="page-header__actions">
        <el-button class="button button--primary" native-type="button" :disabled="!allowed" @click="openDialog('create')">新增账号</el-button>
      </div>
    </header>

    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以管理后台账号。" />
    <template v-else>
      <div v-if="notice" class="operation-message" role="status">{{ notice }}</div>
      <div v-if="error && !dialogMode" class="operation-message operation-message--error" role="alert">{{ error }}</div>
      <section class="panel accounts-panel">
        <AccountFilterToolbar
          :query="query"
          :role-filter="roleFilter"
          :status-filter="statusFilter"
          :loading="loading"
          @update:query="query = $event"
          @update:role-filter="roleFilter = $event"
          @update:status-filter="statusFilter = $event"
          @filter="filter"
          @reset="resetFilters"
        />
        <PageState v-if="loading" type="loading" message="正在读取管理员账号…" />
        <PageState v-else-if="error && items.length === 0" type="error" :message="error" @retry="load" />
        <PageState v-else-if="items.length === 0" type="empty" title="没有匹配的管理员账号" message="请调整筛选条件，或新增账号。" />
        <AccountTable
          v-else
          :rows="items"
          :auth-user-id="auth.user?.id"
          :action-menu-account-id="actionMenuAccount?.id"
          :copied-login-id="copiedLoginId"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          :loading="loading"
          @copy="copyLoginId"
          @toggle="toggleActions"
          @page-change="go"
          @page-size-change="changePageSize"
        />
      </section>
    </template>

    <AccountActionsMenu
      :account="actionMenuAccount"
      :auth-user-id="auth.user?.id"
      :position="actionMenuStyle"
      @select="openDialog"
    />
    <AccountDialog
      :mode="dialogMode"
      :selected="selected"
      :active-editors="activeEditors"
      :form="form"
      :busy="busy"
      :error="error"
      :needs-replacement="needsReplacement"
      :title="dialogTitle"
      @update:form="Object.assign(form, $event)"
      @close="closeDialog"
      @submit="submit"
    />
    <SetupLinkDialog
      :link="setupLink"
      :owner="setupLinkOwner"
      :copied="copied"
      @copy="copySetupLink"
      @close="closeSetupLink"
    />
  </div>
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
