<script setup lang="ts">
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import { computed, ref, useAttrs, type Component } from "vue";
import { RiSearchLine } from "@remixicon/vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    width?: number | string;
  }>(),
  { modelValue: "" },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

const ElButton = ElementButton as Component;
const ElInput = ElementInput as Component;
const SearchIcon = RiSearchLine as Component;
const attrs = useAttrs();
const inputRef = ref<{ focus: () => void } | null>(null);
const inputStyle = computed(() => {
  if (props.width === undefined) return undefined;
  return { width: typeof props.width === "number" ? `${props.width}px` : props.width };
});
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

defineExpose({
  focus: () => inputRef.value?.focus(),
});

function updateValue(value: string | number | null): void {
  emit("update:modelValue", String(value ?? ""));
}

function submit(): void {
  emit("submit");
}
</script>

<template>
  <el-input
    ref="inputRef"
    v-bind="inputAttrs"
    type="search"
    :class="['admin-search-input', attrs.class]"
    :style="[inputStyle, attrs.style]"
    :model-value="props.modelValue"
    @update:model-value="updateValue"
    @keyup.enter.prevent="submit"
  >
    <template #suffix>
      <el-button
        class="admin-search-input__button"
        native-type="button"
        aria-label="搜索"
        @click="submit"
      >
        <component :is="SearchIcon" aria-hidden="true" />
      </el-button>
    </template>
  </el-input>
</template>

<style scoped>
.admin-search-input {
  display: block;
  width: 100%;
  min-width: 0;
}

.admin-search-input :deep(.el-input__wrapper) {
  width: 100%;
  flex: 1 1 auto;
  height: var(--control-height);
  min-height: var(--control-height);
  padding: 0 0 0 var(--space-2);
  border: 1px solid #cfd7e2;
  border-radius: 2px;
  box-sizing: border-box;
  box-shadow: none;
  overflow: hidden;
}

.admin-search-input :deep(.el-input__wrapper:hover),
.admin-search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--color-primary);
  box-shadow: var(--admin-control-outer-shadow);
}

.admin-search-input :deep(.el-input__inner) {
  min-width: 0;
  padding: 0;
}

.admin-search-input :deep(.el-input__suffix) {
  display: flex;
  align-items: stretch;
  height: 100%;
  margin-left: 0;
}

.admin-search-input :deep(.admin-search-input__button) {
  width: calc(var(--control-height) - 2px);
  flex: 0 0 calc(var(--control-height) - 2px);
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-left: 1px solid #cfd7e2;
  border-radius: 0;
  color: var(--color-icon-muted);
  background: var(--color-control-icon-bg);
}

.admin-search-input :deep(.el-input__wrapper:hover .admin-search-input__button),
.admin-search-input :deep(.el-input__wrapper.is-focus .admin-search-input__button) {
  border-left-color: var(--color-primary);
}

.admin-search-input :deep(.admin-search-input__button:hover) {
  color: var(--color-icon-muted);
  background: var(--color-primary-soft);
}

.admin-search-input :deep(.admin-search-input__button:focus-visible) {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.admin-search-input :deep(.admin-search-input__button svg) {
  display: block;
  width: 18px;
  height: 18px;
}
</style>
