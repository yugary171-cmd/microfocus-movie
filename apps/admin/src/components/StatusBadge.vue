<script setup lang="ts">
import StatusBadge from "@/shared/components/StatusBadge.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="StatusBadge" v-bind="$attrs" />
</template>
