<script setup lang="ts">
import TagPickerDialog from "@/features/dramas/components/TagPickerDialog.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="TagPickerDialog" v-bind="$attrs" />
</template>
