<script setup lang="ts">
import AdminSearchInput from "@/shared/components/AdminSearchInput.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="AdminSearchInput" v-bind="$attrs" />
</template>
