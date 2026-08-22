<script setup lang="ts">
import { DRAMA_SUMMARY_MAX_LENGTH, DRAMA_TAG_MAX_COUNT, DRAMA_TAG_MAX_LENGTH, DRAMA_TITLE_MAX_LENGTH, DRAMA_TYPE_OPTIONS } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import type { DramaInput } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

interface TagChip {
  id: string;
  name: string;
}

const props = defineProps<{
  form: DramaInput;
  canEdit: boolean;
  selectedDramaType: (typeof DRAMA_TYPE_OPTIONS)[number] | null;
  selectedTagChips: TagChip[];
}>();

const emit = defineEmits<{
  "update:form": [patch: Partial<DramaInput>];
  "open-tags": [];
  "remove-tag": [tagId: string];
}>();

function update<K extends keyof DramaInput>(key: K, value: DramaInput[K]): void {
  emit("update:form", { [key]: value } as Partial<DramaInput>);
}
</script>

<template>
  <section class="panel" aria-labelledby="metadata-title">
    <div class="panel__header">
      <div>
        <p class="eyebrow">METADATA</p>
        <h2 id="metadata-title">基础信息</h2>
      </div>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>剧名<span class="required-mark" aria-hidden="true">*</span></span>
        <el-input
          class="admin-input"
          :model-value="form.title"
          :disabled="!canEdit"
          :maxlength="DRAMA_TITLE_MAX_LENGTH"
          required
          @update:model-value="update('title', $event)"
        />
      </label>
      <fieldset :class="['field', $style['drama-type']]" :disabled="!canEdit">
        <legend>剧目类型 <span class="required-mark" aria-hidden="true">*</span></legend>
        <div :class="$style['drama-type__options']" role="radiogroup" aria-label="剧目类型">
          <label v-for="option in DRAMA_TYPE_OPTIONS" :key="option.category">
            <input
              :checked="form.category === option.category"
              type="radio"
              name="drama-type"
              :value="option.category"
              @change="update('category', option.category)"
            />
            {{ option.label }}
          </label>
        </div>
        <div :class="$style['drama-type__hints']" aria-live="polite">
          <small
            :class="[$style['drama-type__hint'], !selectedDramaType ? $style['is-active'] : '']"
            :aria-hidden="Boolean(selectedDramaType)"
          >请选择真人、数字真人或漫剧。</small>
          <small
            v-for="option in DRAMA_TYPE_OPTIONS"
            :key="option.category"
            :class="[$style['drama-type__hint'], selectedDramaType?.category === option.category ? $style['is-active'] : '']"
            :aria-hidden="selectedDramaType?.category !== option.category"
          >{{ option.hint }}</small>
        </div>
      </fieldset>
      <label class="field field--wide">
        <span>简介 <span class="required-mark" aria-hidden="true">*</span></span>
        <el-input
          class="admin-input"
          type="textarea"
          :model-value="form.summary"
          :disabled="!canEdit"
          :rows="4"
          :maxlength="DRAMA_SUMMARY_MAX_LENGTH"
          required
          @update:model-value="update('summary', $event)"
        />
      </label>
      <div class="field field--wide">
        <div :class="$style['field-head']">
          <span>标签分类 <span class="required-mark" aria-hidden="true">*</span></span>
          <el-button
            class="button button--secondary button--small"
            native-type="button"
            :disabled="!canEdit"
            @click="emit('open-tags')"
          >选择标签</el-button>
        </div>
        <div :class="$style['tag-summary']">
          <div v-if="selectedTagChips.length" :class="$style['tag-picker__chips']">
            <button
              v-for="tag in selectedTagChips"
              :key="tag.id"
              :class="[$style['tag-chip'], $style['tag-chip--active']]"
              type="button"
              :disabled="!canEdit"
              @click="canEdit && emit('remove-tag', tag.id)"
            >{{ tag.name }}</button>
          </div>
          <p v-else :class="$style['tag-summary__empty']">尚未选择标签</p>
        </div>
        <small>
          从启用词库多选，至少 1 个，最多 {{ DRAMA_TAG_MAX_COUNT }} 个，每个不超过
          {{ DRAMA_TAG_MAX_LENGTH }} 字。弹窗内可搜索，不能随手造词。
        </small>
      </div>
      <slot name="posters" />
    </div>
  </section>
</template>

<style module lang="scss" src="../../styles/drama-editor.module.scss"></style>
