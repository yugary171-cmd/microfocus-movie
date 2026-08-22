<script setup lang="ts">
import ModeBanner from "@/shared/components/ModeBanner.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="ModeBanner" v-bind="$attrs" />
</template>
