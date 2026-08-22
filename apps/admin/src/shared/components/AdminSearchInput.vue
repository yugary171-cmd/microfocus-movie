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
    data-testid="admin-search-input"
    :class="[$style['admin-search-input'], attrs.class]"
    :style="[inputStyle, attrs.style]"
    :model-value="props.modelValue"
    @update:model-value="updateValue"
    @keyup.enter.prevent="submit"
  >
    <template #suffix>
      <el-button
        data-testid="admin-search-submit"
        :class="$style['admin-search-input__button']"
        native-type="button"
        aria-label="搜索"
        @click="submit"
      >
        <component :is="SearchIcon" aria-hidden="true" />
      </el-button>
    </template>
  </el-input>
</template>

<style module lang="scss" src="./AdminSearchInput.module.scss"></style>
