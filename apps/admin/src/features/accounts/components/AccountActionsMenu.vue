<script setup lang="ts">
import type { AdminAccountRecord } from "@/shared/types";
import type { AccountDialogMode } from "@/features/accounts/types";

defineProps<{
  account: AdminAccountRecord | null;
  authUserId: string | undefined;
  position: { top: string; right: string };
}>();

const emit = defineEmits<{ select: [mode: AccountDialogMode, account: AdminAccountRecord] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="account" data-testid="account-actions-menu" :class="$style['account-actions-menu']" role="menu" :style="position">
      <button type="button" role="menuitem" @click="emit('select', 'edit', account)">编辑资料/角色</button>
      <button v-if="account.status === 'PENDING_SETUP'" type="button" role="menuitem" @click="emit('select', 'invite', account)">重发开通链接</button>
      <button v-if="account.status === 'ACTIVE'" type="button" role="menuitem" :disabled="account.id === authUserId" @click="emit('select', 'suspend', account)">停用</button>
      <button v-if="account.status === 'SUSPENDED'" type="button" role="menuitem" @click="emit('select', 'activate', account)">启用</button>
      <button v-if="account.status !== 'PENDING_SETUP'" type="button" role="menuitem" :disabled="account.id === authUserId" @click="emit('select', 'reset', account)">重置登录凭据</button>
    </div>
  </Teleport>
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
