<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: "neutral" | "info" | "warning" | "success" | "danger";
  }>(),
  { tone: "neutral" },
);
</script>

<template>
  <span :class="[$style['status-badge'], tone === 'info' ? $style['status-badge--info'] : '', tone === 'warning' ? $style['status-badge--warning'] : '', tone === 'success' ? $style['status-badge--success'] : '', tone === 'danger' ? $style['status-badge--danger'] : '']">{{ label }}</span>
</template>
<style module lang="scss" src="./StatusBadge.module.scss"></style>
