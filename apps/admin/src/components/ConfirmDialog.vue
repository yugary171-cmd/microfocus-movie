<script setup lang="ts">
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="ConfirmDialog" v-bind="$attrs" />
</template>
