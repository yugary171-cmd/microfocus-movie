<script setup lang="ts">
import ReleaseGatePanel from "@/features/dashboard/components/ReleaseGatePanel.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="ReleaseGatePanel" v-bind="$attrs" />
</template>
