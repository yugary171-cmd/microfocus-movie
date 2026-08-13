<script setup lang="ts">
import { adminApi } from "@/api/admin";
</script>

<template>
  <div v-if="adminApi.mode === 'mock'" class="mode-banner" role="status">
    <span class="mode-banner__badge">演示 Mock</span>
    <span>未配置 API 地址；保存、上传、发布等操作仅影响当前页面内存，不会触发真实云服务。</span>
  </div>
  <div v-else class="mode-banner mode-banner--live" role="status">
    <span class="mode-banner__badge">已连接 API</span>
    <span>{{ adminApi.baseUrl }}</span>
  </div>
</template>
