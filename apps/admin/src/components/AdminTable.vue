<script setup lang="ts">
import AdminTable from "@/shared/components/AdminTable.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="AdminTable" v-bind="$attrs" />
</template>
