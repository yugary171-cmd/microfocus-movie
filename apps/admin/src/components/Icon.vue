<script setup lang="ts">
import Icon from "@/shared/components/Icon.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="Icon" v-bind="$attrs" />
</template>
