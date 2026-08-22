<script setup lang="ts">
import {
  DRAMA_POSTER_SIZE_HINT,
  DRAMA_SUMMARY_MAX_LENGTH,
  DRAMA_TAG_MAX_COUNT,
  DRAMA_TAG_MAX_LENGTH,
  DRAMA_TITLE_MAX_LENGTH,
  DRAMA_TYPE_OPTIONS,
  DramaStatus,
  POSTER_FILE_ACCEPT,
  PROMO_POSTER_SIZE_HINT,
  RIGHTS_DOCUMENT_MAX_LENGTH,
  RIGHTS_HOLDER_MAX_LENGTH,
  RIGHTS_MATERIAL_DIGEST_INPUT_PATTERN,
  RIGHTS_MATERIAL_DIGEST_LENGTH,
  RIGHTS_MATERIAL_KEY_MAX_LENGTH,
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElPopover as ElementPopover } from "element-plus";
import type { Component } from "vue";
import { dramasApi } from "@/features/dramas/api";
import { ConfirmDialog, PageState, StatusBadge } from "@/shared/components";
import { DramaActions, EpisodeTable, TagPickerDialog } from "@/features/dramas/components";
import { useDramaEditorPage } from "@/features/dramas/composables/useDramaEditorPage";
import { dramaStatusLabels } from "@/shared/constants/labels";
import type { EpisodeRecord } from "@/shared/types";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElPopover = ElementPopover as Component;

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
        <RouterLink class="back-link" to="/dramas">← 返回剧目列表</RouterLink>
        <p class="eyebrow">{{ isNew ? "NEW CONTENT" : "CONTENT DETAIL" }}</p>
        <h1>{{ isNew ? "新建剧目" : drama?.title || "剧目详情" }}</h1>
        <div v-if="drama" class="title-meta">
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
        class="inline-message inline-message--error"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="notice"
        class="inline-message inline-message--success"
        role="status"
      >
        {{ notice }}
      </div>
      <div v-if="readonlyReason" class="inline-message" role="status">
        {{ readonlyReason }}
      </div>
      <div
        v-else-if="dramasApi.mode === 'live' && !isNew"
        class="inline-message"
        role="status"
      >
        当前 API
        仅支持更新既有剧目的元数据与新增版权版本；分集标题、时长和媒体保持只读。
      </div>
      <div class="editor-grid" @input="inputChanged" @change="inputChanged">
        <section class="panel" aria-labelledby="metadata-title">
          <div class="panel__header">
            <div>
              <p class="eyebrow">METADATA</p>
              <h2 id="metadata-title">基础信息</h2>
            </div>
          </div>
          <div class="form-grid">
            <label class="field"><span>剧名<span class="required-mark" aria-hidden="true">*</span></span>
              <el-input
                class="admin-input"
                v-model="form.title"
                :disabled="!canEdit"
                :maxlength="DRAMA_TITLE_MAX_LENGTH"
                required
            /></label>
            <fieldset class="field drama-type" :disabled="!canEdit">
              <legend>
                剧目类型 <span class="required-mark" aria-hidden="true">*</span>
              </legend>
              <div
                class="drama-type__options"
                role="radiogroup"
                aria-label="剧目类型"
              >
                <label
                  v-for="option in DRAMA_TYPE_OPTIONS"
                  :key="option.category"
                >
                  <input
                    v-model="form.category"
                    type="radio"
                    name="drama-type"
                    :value="option.category"
                  />
                  {{ option.label }}
                </label>
              </div>
              <div class="drama-type__hints" aria-live="polite">
                <small
                  class="drama-type__hint"
                  :class="{ 'is-active': !selectedDramaType }"
                  :aria-hidden="Boolean(selectedDramaType)"
                  >请选择真人、数字真人或漫剧。</small
                >
                <small
                  v-for="option in DRAMA_TYPE_OPTIONS"
                  :key="option.category"
                  class="drama-type__hint"
                  :class="{
                    'is-active':
                      selectedDramaType?.category === option.category,
                  }"
                  :aria-hidden="selectedDramaType?.category !== option.category"
                  >{{ option.hint }}</small
                >
              </div>
            </fieldset>
            <label class="field field--wide"
              ><span
                >简介
                <span class="required-mark" aria-hidden="true">*</span></span
              ><el-input
                class="admin-input"
                v-model="form.summary"
                type="textarea"
                :disabled="!canEdit"
                :rows="4"
                :maxlength="DRAMA_SUMMARY_MAX_LENGTH"
                required
              />
            </label>
            <div class="field field--wide">
              <div class="field-head">
                <span
                  >标签分类
                  <span class="required-mark" aria-hidden="true">*</span></span
                >
                <el-button
                  class="button button--secondary button--small"
                  native-type="button"
                  :disabled="!canEdit"
                  @click="tagPickerOpen = true"
                >
                  选择标签
                </el-button>
              </div>
              <div class="tag-summary">
                <div v-if="selectedTagChips.length" class="tag-picker__chips">
                  <button
                    v-for="tag in selectedTagChips"
                    :key="tag.id"
                    class="tag-chip tag-chip--active"
                    type="button"
                    :disabled="!canEdit"
                    @click="
                      canEdit &&
                      applySelectedTags(
                        form.tagIds.filter((item) => item !== tag.id),
                      )
                    "
                  >
                    {{ tag.name }}
                  </button>
                </div>
                <p v-else class="tag-summary__empty">尚未选择标签</p>
              </div>
              <small
                >从启用词库多选，至少 1 个，最多
                {{ DRAMA_TAG_MAX_COUNT }} 个，每个不超过
                {{ DRAMA_TAG_MAX_LENGTH }} 字。弹窗内可搜索，不能随手造词。</small
              >
            </div>
            <div class="field field--wide poster-row">
              <div class="field-head">
                <span>剧目海报</span>
                <label
                  class="button button--secondary button--small poster-file"
                >
                  选择文件
                  <input
                    type="file"
                    :accept="POSTER_FILE_ACCEPT"
                    :disabled="!canEdit"
                    @change="choosePoster('cover', $event)"
                  />
                </label>
                <el-popover
                  v-if="form.coverUrl"
                  placement="right-start"
                  :width="248"
                  trigger="click"
                  :teleported="true"
                  popper-class="poster-preview-popover"
                >
                  <template #reference>
                    <el-button
                      class="button button--secondary button--small"
                      native-type="button"
                      aria-label="预览剧目海报"
                    >
                      预览
                    </el-button>
                  </template>
                  <div class="poster-preview-popover__content">
                    <img
                      class="poster-preview-popover__image poster-preview-popover__image--drama"
                      :src="form.coverUrl"
                      alt="剧目海报预览"
                    />
                  </div>
                </el-popover>
                <el-button
                  v-if="form.coverUrl"
                  class="button button--ghost button--small"
                  native-type="button"
                  :disabled="!canEdit"
                  @click="clearPoster('cover')"
                >
                  移除
                </el-button>
              </div>
              <p>
                支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过
                10MB（建议海报尺寸 {{ DRAMA_POSTER_SIZE_HINT }}）
              </p>
            </div>
            <div class="field field--wide poster-row">
              <div class="field-head">
                <span>推广海报</span>
                <label
                  class="button button--secondary button--small poster-file"
                >
                  选择文件
                  <input
                    type="file"
                    :accept="POSTER_FILE_ACCEPT"
                    :disabled="!canEdit"
                    @change="choosePoster('promo', $event)"
                  />
                </label>
                <el-popover
                  v-if="form.promoCoverUrl"
                  placement="right-start"
                  :width="368"
                  trigger="click"
                  :teleported="true"
                  popper-class="poster-preview-popover"
                >
                  <template #reference>
                    <el-button
                      class="button button--secondary button--small"
                      native-type="button"
                      aria-label="预览推广海报"
                    >
                      预览
                    </el-button>
                  </template>
                  <div class="poster-preview-popover__content">
                    <img
                      class="poster-preview-popover__image poster-preview-popover__image--promo"
                      :src="form.promoCoverUrl"
                      alt="推广海报预览"
                    />
                  </div>
                </el-popover>
                <el-button
                  v-if="form.promoCoverUrl"
                  class="button button--ghost button--small"
                  native-type="button"
                  :disabled="!canEdit"
                  @click="clearPoster('promo')"
                >
                  移除
                </el-button>
              </div>
              <p>
                选填，支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过
                10MB（建议海报尺寸 {{ PROMO_POSTER_SIZE_HINT }}）
              </p>
            </div>
          </div>
        </section>
        <div class="editor-grid__right">
          <EpisodeTable
            :model-value="form.episodes as EpisodeRecord[]"
            :drama-id="drama?.id ?? ''"
            :readonly="!canEdit || (dramasApi.mode === 'live' && !isNew)"
            :upload-ready="uploadCapabilities.vodUploadReady"
            :upload-reason="uploadCapabilities.reasons.vodUpload || ''"
            @update:model-value="updateEpisodes"
          />
          <section class="panel" aria-labelledby="rights-title">
            <div class="panel__header">
              <div>
                <p class="eyebrow">RIGHTS & LICENSE</p>
                <h2 id="rights-title">版权与许可</h2>
              </div>
              <StatusBadge
                :label="rightsFilled ? '资料已填写' : '待补齐'"
                :tone="rightsFilled ? 'success' : 'warning'"
              />
            </div>
            <p class="rights-hint">
              草稿可暂不填写。提交审核或发布前须补齐权利方、许可、材料与全部授权范围。
            </p>
            <div class="form-grid">
              <label class="field"
                ><span>权利方</span
                ><el-input
                  class="admin-input"
                  v-model="form.rightsHolder"
                  :disabled="!canEdit"
                  :maxlength="RIGHTS_HOLDER_MAX_LENGTH"
              /></label>
              <label class="field"
                ><span>许可 / 备案编号</span
                ><el-input
                  class="admin-input"
                  v-model="form.licenseNumber"
                  :disabled="!canEdit"
                  :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH"
              /></label>
              <label class="field"
                ><span>许可起始日</span
                ><el-input
                  class="admin-input"
                  v-model="form.rightsValidFrom"
                  :disabled="!canEdit"
                  type="date"
              /></label>
              <label class="field"
                ><span>许可到期日</span
                ><el-input
                  class="admin-input"
                  v-model="form.licenseExpiresAt"
                  :disabled="!canEdit"
                  type="date"
              /></label>
              <label class="field"
                ><span>报备号</span
                ><el-input
                  class="admin-input"
                  v-model="form.rightsReportNumber"
                  :disabled="!canEdit"
                  :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH"
              /></label>
              <label class="field"
                ><span>私有材料对象键</span
                ><el-input
                  class="admin-input"
                  v-model="form.rightsMaterialObjectKey"
                  :disabled="!canEdit"
                  :maxlength="RIGHTS_MATERIAL_KEY_MAX_LENGTH"
                  placeholder="rights/…/document.pdf"
                /><small>仅填写私有对象存储键，不使用公开 URL</small></label
              >
              <label class="field field--wide"
                ><span>材料 SHA-256 摘要</span
                ><el-input
                  class="admin-input"
                  v-model="form.rightsMaterialDigestSha256"
                  :disabled="!canEdit"
                  :minlength="RIGHTS_MATERIAL_DIGEST_LENGTH"
                  :maxlength="RIGHTS_MATERIAL_DIGEST_LENGTH"
                  :pattern="RIGHTS_MATERIAL_DIGEST_INPUT_PATTERN"
                  spellcheck="false"
                  autocomplete="off"
                  placeholder="64 位十六进制摘要"
              /></label>
              <fieldset class="rights-scope field--wide" :disabled="!canEdit">
                <legend>授权范围（填写版权时须逐项确认）</legend>
                <label
                  ><input
                    v-model="form.allowsWechatDistribution"
                    type="checkbox"
                  />
                  允许微信分发</label
                >
                <label
                  ><input v-model="form.allowsAdMonetization" type="checkbox" />
                  允许广告变现</label
                >
                <label
                  ><input v-model="form.allowsTranscoding" type="checkbox" />
                  允许媒体转码</label
                >
                <label
                  ><input
                    v-model="form.allowsPromotionalMaterial"
                    type="checkbox"
                  />
                  允许制作宣传材料</label
                >
              </fieldset>
            </div>
          </section>
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

<style scoped src="../styles/drama-editor.css"></style>
