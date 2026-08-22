<script setup lang="ts">
import AdminPagination from "@/shared/components/AdminPagination.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="AdminPagination" v-bind="$attrs" />
</template>
