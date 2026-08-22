<script setup lang="ts">
import EpisodeTable from "@/features/dramas/components/EpisodeTable.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="EpisodeTable" v-bind="$attrs" />
</template>
