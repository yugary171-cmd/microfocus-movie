<script setup lang="ts">
import {
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
  DRAMA_TAG_MAX_LENGTH,
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { type Component } from "vue";
import { ConfirmDialog, Icon, PageState } from "@/shared/components";
import { useTagLibraryPage } from "@/features/tags/composables/useTagLibraryPage";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const {
  allowed,
  loading,
  busy,
  error,
  notice,
  createOpen,
  pending,
  inspecting,
  inspectAction,
  replacementTagId,
  form,
  grouped,
  inUse,
  canArchive,
  replacementOptions,
  inspectConfirmDisabled,
  chipLabel,
  load,
  createTag,
  confirmStatus,
  inspectTag,
  closeInspect,
  confirmInspect,
} = useTagLibraryPage();
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">TAG LIBRARY</p>
        <h1>标签库</h1>
        <p>维护启用词，可停用或删除。人物、风格、受众不出现在观看端卡片。</p>
      </div>
      <div v-if="allowed" class="page-header__actions">
        <el-button class="button button--primary" native-type="button" @click="createOpen = true">新增标签</el-button>
      </div>
    </header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以维护标签库。" />
    <section v-else class="panel">
      <p v-if="notice" class="tag-library__notice">{{ notice }}</p>
      <PageState v-if="loading" type="loading" message="正在读取标签库…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <div v-else class="tag-library__groups">
        <article v-for="group in grouped" :key="group.id" class="tag-library__group">
          <div class="tag-library__heading">
            <h2>{{ group.label }}</h2>
            <p v-if="group.tags.length">
              {{ group.activeCount }} 启用
              <template v-if="group.archivedCount"> / {{ group.archivedCount }} 停用</template>
            </p>
          </div>
          <p v-if="!group.tags.length" class="tag-library__empty">本组暂无标签</p>
          <div v-else class="tag-picker__chips">
            <span
              v-for="tag in group.tags"
              :key="tag.id"
              class="tag-chip-wrap"
            >
              <button
                class="tag-chip"
                type="button"
                :class="{
                  'tag-chip--active': tag.status === CatalogTagStatus.ACTIVE,
                  'tag-chip--archived': tag.status === CatalogTagStatus.ARCHIVED,
                }"
                :disabled="busy"
                :aria-pressed="tag.status === CatalogTagStatus.ACTIVE"
                :aria-label="chipLabel(tag)"
                @click="tag.status === CatalogTagStatus.ARCHIVED ? (pending = tag) : undefined"
              >
                {{ tag.name }}
              </button>
              <button
                class="tag-chip__remove"
                type="button"
                :disabled="busy"
                :aria-label="`处理「${tag.name}」`"
                @click.stop="inspectTag(tag)"
              >
                <Icon name="close" :size="12" />
              </button>
            </span>
          </div>
        </article>
      </div>
    </section>
    <div v-if="createOpen" class="dialog-backdrop" @keydown.esc="createOpen = false">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="create-tag-title">
        <h2 id="create-tag-title">新增标签</h2>
        <p>名称在同一分组内不可重复。不能改名；删除前若仍有剧目引用，必须替换成同组其他启用词。</p>
        <label class="field">
          <span>分组</span>
          <el-select v-model="form.group" class="admin-select" aria-label="分组">
            <el-option v-for="group in CATALOG_TAG_GROUPS" :key="group.id" :label="group.label" :value="group.id" />
          </el-select>
        </label>
        <label class="field">
          <span>名称</span>
          <el-input v-model="form.name" class="admin-input" type="text" :maxlength="DRAMA_TAG_MAX_LENGTH" placeholder="例如：赛博" />
        </label>
        <div class="dialog__actions">
          <el-button class="button button--ghost" native-type="button" :disabled="busy" @click="createOpen = false">取消</el-button>
          <el-button class="button button--primary" native-type="button" :disabled="busy || !form.name.trim()" @click="createTag">保存</el-button>
        </div>
      </section>
    </div>
    <ConfirmDialog
      :open="Boolean(pending)"
      :title="pending?.status === CatalogTagStatus.ACTIVE ? '停用标签' : '启用标签'"
      :message="
        pending?.status === CatalogTagStatus.ACTIVE
          ? `停用「${pending?.name ?? ''}」后，编辑不能再勾选它，已保存在剧上的标签不会自动删除。`
          : `重新启用「${pending?.name ?? ''}」后，编辑可以再次勾选。`
      "
      :tone="pending?.status === CatalogTagStatus.ACTIVE ? 'danger' : 'primary'"
      :busy="busy"
      :confirm-label="pending?.status === CatalogTagStatus.ACTIVE ? '停用' : '启用'"
      @close="pending = null"
      @confirm="confirmStatus"
    />
    <div v-if="inspecting" class="dialog-backdrop" @keydown.esc="closeInspect">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="inspect-tag-title">
        <h2 id="inspect-tag-title">{{ inUse ? "标签使用中" : "处理标签" }}</h2>
        <p v-if="inUse">
          「{{ inspecting.name }}」正在被 {{ inspecting.usageCount }} 部剧使用。建议先替换再删除，或先停用（已有剧上的标签不会改写）。
        </p>
        <p v-else>
          「{{ inspecting.name }}」当前没有剧目使用。可以选择删除，{{ canArchive ? "或先停用。" : "删除后不可恢复。" }}
        </p>
        <fieldset class="tag-library__choices">
          <legend class="visually-hidden">选择操作</legend>
          <label v-if="canArchive" class="tag-library__choice">
            <input v-model="inspectAction" type="radio" value="archive" />
            <span>停用</span>
          </label>
          <label class="tag-library__choice">
            <input v-model="inspectAction" type="radio" value="delete" />
            <span>{{ inUse ? "替换后删除" : "删除" }}</span>
          </label>
        </fieldset>
        <label v-if="inspectAction === 'delete' && inUse" class="field">
          <span>替换为</span>
          <el-select v-model="replacementTagId" class="admin-select" aria-label="替换为">
            <el-option label="请选择同组启用词" value="" />
            <el-option v-for="tag in replacementOptions" :key="tag.id" :label="tag.name" :value="tag.id" />
          </el-select>
        </label>
        <p v-if="inspectAction === 'delete' && inUse && !replacementOptions.length" class="tag-library__empty">
          同组没有其他启用词，无法替换删除。
        </p>
        <div class="dialog__actions">
          <el-button class="button button--ghost" native-type="button" :disabled="busy" @click="closeInspect">取消</el-button>
          <el-button
            class="button"
            :class="inspectAction === 'delete' ? 'button--danger' : 'button--primary'"
            native-type="button"
            :disabled="inspectConfirmDisabled"
            @click="confirmInspect"
          >
            确认
          </el-button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped src="../styles/tag-library.css"></style>
