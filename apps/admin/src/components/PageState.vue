<script setup lang="ts">
import PageState from "@/shared/components/PageState.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="PageState" v-bind="$attrs" />
</template>
