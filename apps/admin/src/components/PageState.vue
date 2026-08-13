<script setup lang="ts">
withDefaults(
  defineProps<{
    type: "loading" | "empty" | "error" | "forbidden";
    title?: string;
    message?: string;
  }>(),
  { title: "", message: "" },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="page-state" :class="`page-state--${type}`" :role="type === 'error' ? 'alert' : 'status'">
    <span class="page-state__icon" aria-hidden="true">
      {{ type === "loading" ? "◌" : type === "empty" ? "◇" : type === "forbidden" ? "⊘" : "!" }}
    </span>
    <h2>{{ title || (type === "loading" ? "正在加载" : type === "empty" ? "暂无数据" : type === "forbidden" ? "无权访问" : "加载失败") }}</h2>
    <p v-if="message">{{ message }}</p>
    <button v-if="type === 'error'" class="button button--secondary" type="button" @click="$emit('retry')">
      重新加载
    </button>
    <slot />
  </div>
</template>
