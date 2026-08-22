<script setup lang="ts">
import DramaDetailDrawer from "@/features/dramas/components/DramaDetailDrawer.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="DramaDetailDrawer" v-bind="$attrs" />
</template>
