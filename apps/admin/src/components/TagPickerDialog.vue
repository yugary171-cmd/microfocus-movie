<script setup lang="ts">
import { ADMIN_DRAMA_TAG_GROUPS, DRAMA_TAG_MAX_COUNT, DRAMA_TAG_MAX_LENGTH } from "@microfocus/contracts";
import { computed, nextTick, ref, watch } from "vue";
import Icon from "./Icon.vue";

const props = defineProps<{
  open: boolean;
  selected: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [tags: string[]];
}>();

const query = ref("");
const draft = ref<string[]>([]);
const searchInput = ref<HTMLInputElement | null>(null);

const catalogTagSet = new Set<string>(
  ADMIN_DRAMA_TAG_GROUPS.flatMap((group) => [...group.options]),
);

const customTags = computed(() => draft.value.filter((tag) => !catalogTagSet.has(tag)));
const atLimit = computed(() => draft.value.length >= DRAMA_TAG_MAX_COUNT);
const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const visibleGroups = computed(() => {
  const keyword = normalizedQuery.value;
  return ADMIN_DRAMA_TAG_GROUPS.map((group) => ({
    ...group,
    options: keyword
      ? group.options.filter((tag) => tag.toLowerCase().includes(keyword))
      : [...group.options],
  })).filter((group) => group.options.length > 0);
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
);

function isSelected(tag: string): boolean {
  return draft.value.includes(tag);
}

function toggle(tag: string): void {
  if (props.disabled) return;
  const index = draft.value.indexOf(tag);
  if (index >= 0) {
    draft.value = draft.value.filter((item) => item !== tag);
    return;
  }
  if (draft.value.length >= DRAMA_TAG_MAX_COUNT) return;
  draft.value = [...draft.value, tag];
}

function confirm(): void {
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
          <input
            ref="searchInput"
            v-model="query"
            type="search"
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
                :key="`${group.id}-${tag}`"
                class="tag-chip"
                type="button"
                :class="{ 'tag-chip--active': isSelected(tag) }"
                :disabled="disabled || (atLimit && !isSelected(tag))"
                :aria-pressed="isSelected(tag)"
                @click="toggle(tag)"
              >{{ tag }}</button>
            </div>
          </div>
          <div v-if="customTags.length" class="tag-picker__group">
            <p class="tag-picker__label">已选其他</p>
            <div class="tag-picker__chips">
              <button
                v-for="tag in customTags"
                :key="`custom-${tag}`"
                class="tag-chip tag-chip--active"
                type="button"
                :disabled="disabled"
                :aria-pressed="true"
                @click="toggle(tag)"
              >{{ tag }}</button>
            </div>
          </div>
        </div>
        <div class="dialog__actions">
          <button class="button button--ghost" type="button" @click="emit('close')">取消</button>
          <button class="button button--primary" type="button" @click="confirm">完成</button>
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
.tag-dialog__empty { color: var(--color-muted); font-size: 13px; }
.tag-picker__group { display: grid; gap: var(--space-2); }
.tag-picker__label { margin: 0; color: var(--color-muted); font-size: 11px; font-weight: 650; letter-spacing: 0.04em; }
.tag-picker__chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tag-chip { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border); border-radius: 999px; background: #fff; color: #344054; font-size: 12px; line-height: 1.2; }
.tag-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.tag-chip--active { border-color: #c9d7ee; background: #eef4ff; color: var(--color-primary); font-weight: 650; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
