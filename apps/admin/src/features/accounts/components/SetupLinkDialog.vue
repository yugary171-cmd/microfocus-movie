<script setup lang="ts">
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import type { AdminSetupLink } from "@/shared/types";
import { formatDateTime } from "@/shared/utils/format";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

defineProps<{
  link: AdminSetupLink | null;
  owner: string;
  copied: boolean;
}>();

const emit = defineEmits<{ copy: []; close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="link" class="dialog-backdrop">
      <section data-testid="setup-link-dialog" :class="['dialog', $style['setup-link-dialog']]" role="dialog" aria-modal="true" aria-labelledby="setup-link-title">
        <h2 id="setup-link-title">一次性{{ link.purpose === 'INVITE' ? '开通' : '凭据重置' }}链接</h2>
        <p>请把链接安全地交给 {{ owner }}。链接关闭后不再显示，新的链接会使旧链接失效。</p>
        <label class="field"><span>链接（仅本次显示）</span><el-input :model-value="link.setupUrl" class="admin-input" type="textarea" :rows="4" readonly @focus="($event.target as HTMLTextAreaElement).select()" /></label>
        <p>有效期至：<strong>{{ formatDateTime(link.expiresAt) }}</strong></p>
        <div class="dialog__actions"><el-button class="button button--secondary" native-type="button" @click="emit('copy')">{{ copied ? '已复制' : '复制链接' }}</el-button><el-button class="button button--primary" native-type="button" @click="emit('close')">我已安全保存</el-button></div>
      </section>
    </div>
  </Teleport>
</template>

<style module lang="scss" src="../styles/accounts.module.scss"></style>
