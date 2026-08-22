<script setup lang="ts">
import { CATALOG_TAG_GROUPS, DRAMA_TAG_MAX_COUNT, DRAMA_TAG_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton } from "element-plus";
import { computed, nextTick, ref, watch, type Component } from "vue";
import Icon from "./Icon.vue";
import AdminSearchInput from "./AdminSearchInput.vue";

const ElButton = ElementButton as Component;

interface TagPickerOption {
  id: string;
  name: string;
}

const props = defineProps<{
  open: boolean;
  selected: string[];
  groups?: ReadonlyArray<{ id: string; label: string; options: readonly TagPickerOption[] }>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [tagIds: string[]];
}>();

const query = ref("");
const draft = ref<string[]>([]);
const searchInput = ref<{ focus: () => void } | null>(null);

const libraryGroups = computed(() =>
  (props.groups?.length ? props.groups : CATALOG_TAG_GROUPS.map((group) => ({ ...group, options: [] }))).map(
    (group) => ({
      id: group.id,
      label: group.label,
      options: [...group.options],
    }),
  ),
);

const catalogTagSet = computed(() => new Set(libraryGroups.value.flatMap((group) => group.options.map((tag) => tag.id))));
const namesById = computed(() => {
  const names = new Map<string, string>();
  for (const group of libraryGroups.value) {
    for (const tag of group.options) names.set(tag.id, tag.name);
  }
  return names;
});
const customTags = computed(() => draft.value.filter((tagId) => !catalogTagSet.value.has(tagId)));
const atLimit = computed(() => draft.value.length >= DRAMA_TAG_MAX_COUNT);
const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const visibleGroups = computed(() => {
  const keyword = normalizedQuery.value;
  return libraryGroups.value
    .map((group) => ({
      ...group,
      options: keyword
        ? group.options.filter((tag) => tag.name.toLowerCase().includes(keyword))
        : [...group.options],
    }))
    .filter((group) => group.options.length > 0);
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    draft.value = [...props.selected];
    query.value = "";
    await nextTick();
    searchInput.value?.focus();
  },
  { immediate: true },
);

function isSelected(tagId: string): boolean {
  return draft.value.includes(tagId);
}

function toggle(tagId: string): void {
  if (props.disabled) return;
  const index = draft.value.indexOf(tagId);
  if (index >= 0) {
    draft.value = draft.value.filter((item) => item !== tagId);
    return;
  }
  if (draft.value.length >= DRAMA_TAG_MAX_COUNT) return;
  draft.value = [...draft.value, tagId];
}

function labelFor(tagId: string): string {
  return namesById.value.get(tagId) ?? "未知标签";
}

function confirm(): void {
  if (customTags.value.length) return;
  emit("confirm", [...draft.value]);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @keydown.esc="emit('close')">
      <section class="dialog tag-dialog" role="dialog" aria-modal="true" aria-labelledby="tag-picker-title">
        <div class="tag-dialog__header">
          <div>
            <p class="eyebrow">TAG LIBRARY</p>
            <h2 id="tag-picker-title">选择标签</h2>
          </div>
          <button class="icon-button" type="button" aria-label="关闭" @click="emit('close')"><Icon name="close" /></button>
        </div>
        <label class="field">
          <span class="visually-hidden">搜索标签</span>
          <AdminSearchInput
            ref="searchInput"
            v-model="query"
            placeholder="搜索标签，如：都市、重生、男频"
            :maxlength="DRAMA_TAG_MAX_LENGTH"
          />
        </label>
        <p class="tag-dialog__count">已选 {{ draft.length }} / {{ DRAMA_TAG_MAX_COUNT }}</p>
        <div class="tag-dialog__body">
          <div v-if="!visibleGroups.length && !customTags.length" class="tag-dialog__empty">没有匹配的标签</div>
          <div v-for="group in visibleGroups" :key="group.id" class="tag-picker__group">
            <p class="tag-picker__label">{{ group.label }}</p>
            <div class="tag-picker__chips">
              <button
                v-for="tag in group.options"
                :key="tag.id"
                class="tag-chip"
                type="button"
                :class="{ 'tag-chip--active': isSelected(tag.id) }"
                :disabled="disabled || (atLimit && !isSelected(tag.id))"
                :aria-pressed="isSelected(tag.id)"
                @click="toggle(tag.id)"
              >{{ tag.name }}</button>
            </div>
          </div>
          <div v-if="customTags.length" class="tag-picker__group">
            <p class="tag-picker__label">已选其他</p>
            <p class="tag-dialog__hint">历史残留词，保存前必须去掉。</p>
            <div class="tag-picker__chips">
              <button
                v-for="tagId in customTags"
                :key="`custom-${tagId}`"
                class="tag-chip tag-chip--active"
                type="button"
                :disabled="disabled"
                :aria-pressed="true"
                @click="toggle(tagId)"
              >{{ labelFor(tagId) }}</button>
            </div>
          </div>
        </div>
        <div class="dialog__actions">
          <el-button class="button button--ghost" native-type="button" @click="emit('close')">取消</el-button>
          <el-button class="button button--primary" native-type="button" :disabled="Boolean(customTags.length)" @click="confirm">完成</el-button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tag-dialog { width: min(720px, calc(100vw - 32px)); max-height: min(82vh, 760px); display: grid; grid-template-rows: auto auto auto 1fr auto; }
.tag-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.tag-dialog__header h2, .tag-dialog__header .eyebrow { margin-bottom: 0; }
.tag-dialog__count { margin: var(--space-2) 0 0; color: var(--color-muted); font-size: 12px; font-weight: 400; }
.tag-dialog__body { overflow: auto; display: grid; gap: var(--space-3); margin: var(--space-3) 0; padding-right: var(--space-1); }
.tag-dialog__empty { color: var(--color-muted); font-size: 12px; }
.tag-dialog__hint { margin: 0; color: var(--color-danger); font-size: 12px; font-weight: 400; }
.tag-picker__group { display: grid; gap: var(--space-2); }
.tag-picker__label { margin: 0; color: var(--color-muted); font-size: 12px; font-weight: 650; letter-spacing: 0.04em; }
.tag-picker__chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tag-chip { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border); border-radius: 999px; background: #fff; color: #344054; font-size: 12px; line-height: 1.2; }
.tag-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.tag-chip--active { border-color: #c9d7ee; background: #eef4ff; color: var(--color-primary); font-weight: 650; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
