<script setup lang="ts">
import DramaActions from "@/features/dramas/components/DramaActions.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="DramaActions" v-bind="$attrs" />
</template>
