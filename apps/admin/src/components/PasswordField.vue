<script setup lang="ts">
import PasswordField from "@/shared/components/PasswordField.vue";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <!-- @vue-ignore -->
  <component :is="PasswordField" v-bind="$attrs" />
</template>
