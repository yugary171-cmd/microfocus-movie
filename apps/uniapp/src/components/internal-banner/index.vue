<script setup lang="ts">
defineProps<{ visible?: boolean }>();
</script>

<template>
  <view v-if="visible" class="banner" role="status" aria-label="内部体验模式">
    内部体验数据 · 不代表正式内容与真实权益
  </view>
</template>

<style scoped src="../../styles/internal-banner.scss"></style>
