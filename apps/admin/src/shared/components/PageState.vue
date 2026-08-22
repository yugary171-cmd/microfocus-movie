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
  <div :class="[$style['page-state'], type === 'loading' ? $style['page-state--loading'] : '', type === 'error' ? $style['page-state--error'] : '', type === 'forbidden' ? $style['page-state--forbidden'] : '']" :role="type === 'error' ? 'alert' : 'status'">
    <span :class="$style['page-state__icon']"><Icon :name="type === 'loading' ? 'loading' : type === 'empty' ? 'empty' : type === 'forbidden' ? 'forbidden' : 'error'" /></span>
    <h2>{{ title || (type === "loading" ? "正在加载" : type === "empty" ? "暂无数据" : type === "forbidden" ? "无权访问" : "加载失败") }}</h2>
    <p v-if="message">{{ message }}</p>
    <el-button v-if="type === 'error'" class="button button--secondary" native-type="button" @click="$emit('retry')">
      重新加载
    </el-button>
    <slot />
  </div>
</template>
<style module lang="scss" src="./PageState.module.scss"></style>
