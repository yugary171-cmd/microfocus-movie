<script setup lang="ts">
import {
  DramaStatus,
} from "@microfocus/contracts";
import { dramasApi } from "@/features/dramas/api";
import { ConfirmDialog, PageState, StatusBadge } from "@/shared/components";
import {
  DramaActions,
  DramaMetadataSection,
  DramaPosterFields,
  DramaRightsSection,
  EpisodeTable,
  TagPickerDialog,
} from "@/features/dramas/components";
import { useDramaEditorPage } from "@/features/dramas/composables/useDramaEditorPage";
import { dramaStatusLabels } from "@/shared/constants/labels";
import type { EpisodeRecord } from "@/shared/types";

const {
  auth,
  isNew,
  loading,
  saving,
  actionBusy,
  error,
  notice,
  dirty,
  drama,
  gate,
  dialog,
  form,
  tagPickerOpen,
  tagGroups,
  selectedDramaType,
  rightsFilled,
  uploadCapabilities,
  canEdit,
  readonlyReason,
  selectedTagChips,
  choosePoster,
  clearPoster,
  applySelectedTags,
  inputChanged,
  updateEpisodes,
  load,
  save,
  submitReview,
  confirmAction,
} = useDramaEditorPage();
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <RouterLink :class="$style['back-link']" to="/dramas">← 返回剧目列表</RouterLink>
        <p class="eyebrow">{{ isNew ? "NEW CONTENT" : "CONTENT DETAIL" }}</p>
        <h1>{{ isNew ? "新建剧目" : drama?.title || "剧目详情" }}</h1>
        <div v-if="drama" :class="$style['title-meta']">
          <StatusBadge
            :label="dramaStatusLabels[drama.status]"
            :tone="
              drama.status === DramaStatus.PUBLISHED ||
              drama.status === DramaStatus.READY
                ? 'success'
                : drama.status === DramaStatus.OFFLINE
                  ? 'danger'
                  : 'warning'
            "
          /><span>负责人：{{ drama.ownerName }}</span>
        </div>
      </div>
      <div class="page-header__actions" aria-label="剧目操作">
        <span v-if="canEdit" class="action-with-help">
          <el-button
            class="button button--secondary"
            native-type="button"
            :disabled="saving || !dirty"
            @click="save"
          >
            {{ saving ? "保存中…" : "保存草稿" }}
          </el-button>
        </span>
        <DramaActions
          v-if="auth.user && drama"
          :user="auth.user"
          :drama="drama"
          :gate="gate"
          :mock-mode="dramasApi.mode === 'mock'"
          :busy="actionBusy || saving"
          @submit="submitReview"
          @publish="dialog.type = 'publish'"
          @offline="dialog.type = 'offline'"
        />
      </div>
    </header>
    <PageState
      v-if="loading"
      type="loading"
      message="正在加载剧目、许可与发布闸门…"
    />
    <PageState
      v-else-if="error && !drama && !isNew"
      type="error"
      :message="error"
      @retry="load"
    />
    <template v-else>
      <div
        v-if="error"
        :class="[$style['inline-message'], $style['inline-message--error']]"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="notice"
        :class="[$style['inline-message'], $style['inline-message--success']]"
        role="status"
      >
        {{ notice }}
      </div>
      <div v-if="readonlyReason" :class="$style['inline-message']" role="status">
        {{ readonlyReason }}
      </div>
      <div
        v-else-if="dramasApi.mode === 'live' && !isNew"
        :class="$style['inline-message']"
        role="status"
      >
        当前 API
        仅支持更新既有剧目的元数据与新增版权版本；分集标题、时长和媒体保持只读。
      </div>
      <div :class="$style['editor-grid']" @input="inputChanged" @change="inputChanged">
        <DramaMetadataSection
          :form="form"
          :can-edit="canEdit"
          :selected-drama-type="selectedDramaType"
          :selected-tag-chips="selectedTagChips"
          @update:form="Object.assign(form, $event)"
          @open-tags="tagPickerOpen = true"
          @remove-tag="applySelectedTags(form.tagIds.filter((item) => item !== $event))"
        >
          <template #posters>
            <DramaPosterFields
              :cover-url="form.coverUrl"
              :promo-cover-url="form.promoCoverUrl"
              :can-edit="canEdit"
              @choose="choosePoster"
              @clear="clearPoster"
            />
          </template>
        </DramaMetadataSection>
        <div :class="$style['editor-grid__right']">
          <EpisodeTable
            :model-value="form.episodes as EpisodeRecord[]"
            :drama-id="drama?.id ?? ''"
            :readonly="!canEdit || (dramasApi.mode === 'live' && !isNew)"
            :upload-ready="uploadCapabilities.vodUploadReady"
            :upload-reason="uploadCapabilities.reasons.vodUpload || ''"
            @update:model-value="updateEpisodes"
          />
          <DramaRightsSection
            :form="form"
            :can-edit="canEdit"
            :rights-filled="rightsFilled"
            @update:form="Object.assign(form, $event)"
          />
        </div>
      </div>
    </template>
    <ConfirmDialog
      :open="dialog.type === 'publish'"
      title="确认发布剧目"
      message="发布前将由服务端再次校验合规闸门、内容审核、版权与媒体状态。确认继续？"
      confirm-label="确认发布"
      :busy="actionBusy"
      @close="dialog.type = null"
      @confirm="confirmAction"
    />
    <ConfirmDialog
      :open="dialog.type === 'offline'"
      title="确认下架剧目"
      message="下架会阻止新的播放租约，并可能影响正在观看的用户。请说明原因。"
      confirm-label="确认下架"
      tone="danger"
      require-reason
      reason-label="下架原因"
      :busy="actionBusy"
      @close="dialog.type = null"
      @confirm="confirmAction"
    />
    <TagPickerDialog
      :open="tagPickerOpen"
      :selected="form.tagIds"
      :groups="tagGroups"
      :disabled="!canEdit"
      @close="tagPickerOpen = false"
      @confirm="applySelectedTags"
    />
  </div>
</template>

<style module lang="scss" src="../styles/drama-editor.module.scss"></style>
