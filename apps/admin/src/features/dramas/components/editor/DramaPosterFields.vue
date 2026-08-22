<script setup lang="ts">
import { DRAMA_POSTER_SIZE_HINT, POSTER_FILE_ACCEPT, PROMO_POSTER_SIZE_HINT } from "@microfocus/contracts";
import { ElButton as ElementButton, ElPopover as ElementPopover } from "element-plus";
import type { Component } from "vue";

const ElButton = ElementButton as Component;
const ElPopover = ElementPopover as Component;

const props = defineProps<{
  coverUrl: string;
  promoCoverUrl: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  choose: [kind: "cover" | "promo", event: Event];
  clear: [kind: "cover" | "promo"];
}>();
</script>

<template>
  <div :class="['field', 'field--wide', $style['poster-row']]">
    <div :class="$style['field-head']">
      <span>剧目海报</span>
      <label :class="['button', 'button--secondary', 'button--small', $style['poster-file']]">
        选择文件
        <input
          type="file"
          :accept="POSTER_FILE_ACCEPT"
          :disabled="!canEdit"
          @change="emit('choose', 'cover', $event)"
        />
      </label>
      <el-popover
        v-if="coverUrl"
        placement="right-start"
        :width="248"
        trigger="click"
        :teleported="true"
        popper-class="poster-preview-popover"
      >
        <template #reference>
          <el-button class="button button--secondary button--small" native-type="button" aria-label="预览剧目海报">预览</el-button>
        </template>
        <div :class="$style['poster-preview-popover__content']">
          <img
            :class="[$style['poster-preview-popover__image'], $style['poster-preview-popover__image--drama']]"
            :src="coverUrl"
            alt="剧目海报预览"
          />
        </div>
      </el-popover>
      <el-button
        v-if="coverUrl"
        class="button button--ghost button--small"
        native-type="button"
        :disabled="!canEdit"
        @click="emit('clear', 'cover')"
      >移除</el-button>
    </div>
    <p>支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过 10MB（建议海报尺寸 {{ DRAMA_POSTER_SIZE_HINT }}）</p>
  </div>
  <div :class="['field', 'field--wide', $style['poster-row']]">
    <div :class="$style['field-head']">
      <span>推广海报</span>
      <label :class="['button', 'button--secondary', 'button--small', $style['poster-file']]">
        选择文件
        <input
          type="file"
          :accept="POSTER_FILE_ACCEPT"
          :disabled="!canEdit"
          @change="emit('choose', 'promo', $event)"
        />
      </label>
      <el-popover
        v-if="promoCoverUrl"
        placement="right-start"
        :width="368"
        trigger="click"
        :teleported="true"
        popper-class="poster-preview-popover"
      >
        <template #reference>
          <el-button class="button button--secondary button--small" native-type="button" aria-label="预览推广海报">预览</el-button>
        </template>
        <div :class="$style['poster-preview-popover__content']">
          <img
            :class="[$style['poster-preview-popover__image'], $style['poster-preview-popover__image--promo']]"
            :src="promoCoverUrl"
            alt="推广海报预览"
          />
        </div>
      </el-popover>
      <el-button
        v-if="promoCoverUrl"
        class="button button--ghost button--small"
        native-type="button"
        :disabled="!canEdit"
        @click="emit('clear', 'promo')"
      >移除</el-button>
    </div>
    <p>选填，支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过 10MB（建议海报尺寸 {{ PROMO_POSTER_SIZE_HINT }}）</p>
  </div>
</template>

<style module lang="scss" src="../../styles/drama-editor.module.scss"></style>
