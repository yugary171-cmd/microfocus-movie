<script setup lang="ts">
import { ElButton as ElementButton } from "element-plus";
import { type Component } from "vue";
import Icon from "./Icon.vue";

const ElButton = ElementButton as Component;

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
    <span class="page-state__icon"><Icon :name="type === 'loading' ? 'loading' : type === 'empty' ? 'empty' : type === 'forbidden' ? 'forbidden' : 'error'" /></span>
    <h2>{{ title || (type === "loading" ? "正在加载" : type === "empty" ? "暂无数据" : type === "forbidden" ? "无权访问" : "加载失败") }}</h2>
    <p v-if="message">{{ message }}</p>
    <el-button v-if="type === 'error'" class="button button--secondary" native-type="button" @click="$emit('retry')">
      重新加载
    </el-button>
    <slot />
  </div>
</template>
