<script setup lang="ts">
import {
  isOwnedContentRole,
  isSuperAdmin,
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
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
  normalizeDramaTypeCategory,
  type CatalogTag,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import DramaActions from "@/components/DramaActions.vue";
import EpisodeTable from "@/components/EpisodeTable.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import TagPickerDialog from "@/components/TagPickerDialog.vue";
import { dramaStatusLabels } from "@/i18n";
import { dramaDraftError, posterFileError } from "@/policies/drama-input";
import { useAuthStore } from "@/stores/auth";
import type { DramaInput, DramaRecord, EpisodeRecord } from "@/types/admin";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const id = computed(() =>
  typeof route.params.id === "string" ? route.params.id : "",
);
const isNew = computed(() => !id.value);
const loading = ref(!isNew.value);
const saving = ref(false);
const actionBusy = ref(false);
const error = ref("");
const notice = ref("");
const dirty = ref(false);
const drama = ref<DramaRecord | null>(null);
const gate = ref<ReleaseGateStatus>({
  entityApproved: false,
  miniProgramFilingApproved: false,
  wechatCategoryApproved: false,
  adsApproved: false,
  readyForExternalTraffic: false,
  blockers: ["发布闸门状态尚未加载"],
});
const dialog = reactive<{ type: "publish" | "offline" | null }>({ type: null });

const form = reactive<DramaInput>({
  title: "",
  summary: "",
  category: "",
  tagIds: [],
  coverUrl: "",
  promoCoverUrl: "",
  rightsHolder: "",
  licenseNumber: "",
  rightsValidFrom: "",
  licenseExpiresAt: "",
  rightsReportNumber: "",
  rightsMaterialObjectKey: "",
  rightsMaterialDigestSha256: "",
  allowsWechatDistribution: false,
  allowsAdMonetization: false,
  allowsTranscoding: false,
  allowsPromotionalMaterial: false,
  episodes: [],
});

const tagPickerOpen = ref(false);
const tagLibrary = ref<CatalogTag[]>([]);
const tagGroups = computed(() =>
  CATALOG_TAG_GROUPS.map((group) => ({
    ...group,
    options: tagLibrary.value
      .filter((tag) => tag.group === group.id && tag.status === CatalogTagStatus.ACTIVE)
      .map((tag) => ({ id: tag.id, name: tag.name })),
  })),
);
const selectedDramaType = computed(
  () =>
    DRAMA_TYPE_OPTIONS.find((option) => option.category === form.category) ??
    null,
);
const rightsFilled = computed(() =>
  Boolean(form.licenseNumber.trim() && form.rightsHolder.trim()),
);
const localPosterUrls = reactive({ cover: "", promo: "" });

const canEdit = computed(() => {
  if (!auth.user) return false;
  if (isSuperAdmin(auth.user.role)) return true;
  return (
    isOwnedContentRole(auth.user.role) &&
    (isNew.value || drama.value?.ownerId === auth.user.id)
  );
});

const readonlyReason = computed(() => {
  if (canEdit.value) return "";
  return "只能编辑本人负责的剧目。";
});

function applyDrama(value: DramaRecord): void {
  drama.value = value;
  Object.assign(form, {
    title: value.title ?? "",
    summary: value.summary ?? "",
    category: value.category ?? "",
    tagIds: Array.isArray(value.tagIds) ? value.tagIds : [],
    coverUrl: value.coverUrl ?? "",
    promoCoverUrl: value.promoCoverUrl ?? "",
    rightsHolder: value.rightsHolder ?? "",
    licenseNumber: value.licenseNumber ?? "",
    rightsValidFrom: value.rightsValidFrom ?? "",
    licenseExpiresAt: value.licenseExpiresAt ?? "",
    rightsReportNumber: value.rightsReportNumber ?? "",
    rightsMaterialObjectKey: value.rightsMaterialObjectKey ?? "",
    rightsMaterialDigestSha256: value.rightsMaterialDigestSha256 ?? "",
    allowsWechatDistribution: value.allowsWechatDistribution === true,
    allowsAdMonetization: value.allowsAdMonetization === true,
    allowsTranscoding: value.allowsTranscoding === true,
    allowsPromotionalMaterial: value.allowsPromotionalMaterial === true,
    episodes: Array.isArray(value.episodes) ? value.episodes : [],
  });
  const knownType = normalizeDramaTypeCategory(form.category);
  form.category = knownType;
  dirty.value = false;
}

function revokeLocalUrl(kind: "cover" | "promo"): void {
  const current = localPosterUrls[kind];
  if (current) URL.revokeObjectURL(current);
  localPosterUrls[kind] = "";
}

function choosePoster(kind: "cover" | "promo", event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !canEdit.value) return;
  const validation = posterFileError(file);
  if (validation) {
    error.value = validation;
    return;
  }
  if (adminApi.mode === "live") {
    error.value = "真实环境尚未接入海报对象存储，不能用本地文件代替封面。";
    return;
  }
  revokeLocalUrl(kind);
  const objectUrl = URL.createObjectURL(file);
  localPosterUrls[kind] = objectUrl;
  if (kind === "cover") form.coverUrl = objectUrl;
  else form.promoCoverUrl = objectUrl;
  inputChanged();
}

function clearPoster(kind: "cover" | "promo"): void {
  if (!canEdit.value) return;
  revokeLocalUrl(kind);
  if (kind === "cover") form.coverUrl = "";
  else form.promoCoverUrl = "";
  inputChanged();
}

const selectedTagChips = computed(() =>
  form.tagIds.map((id) => ({
    id,
    name: tagLibrary.value.find((tag) => tag.id === id)?.name ?? "未知标签",
  })),
);

function applySelectedTags(tagIds: string[]): void {
  form.tagIds = [...tagIds];
  tagPickerOpen.value = false;
  inputChanged();
}

function inputChanged(): void {
  dirty.value = true;
  notice.value = "";
}

function updateEpisodes(value: EpisodeRecord[]): void {
  form.episodes = value;
  inputChanged();
}

async function load(): Promise<void> {
  error.value = "";
  loading.value = !isNew.value;
  try {
    const [gateResult, dramaResult, tagsResult] = await Promise.all([
      adminApi.releaseGate(),
      isNew.value ? Promise.resolve(null) : adminApi.getDrama(id.value),
      adminApi.listCatalogTags(),
    ]);
    gate.value = gateResult;
    tagLibrary.value = Array.isArray(tagsResult.items) ? tagsResult.items : [];
    if (dramaResult) applyDrama(dramaResult);
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

function normalizedInput(): DramaInput {
  return {
    ...form,
    title: form.title.trim(),
    summary: form.summary.trim(),
    category: normalizeDramaTypeCategory(form.category),
    tagIds: [...form.tagIds],
    coverUrl: form.coverUrl.trim(),
    promoCoverUrl: form.promoCoverUrl.trim(),
    rightsHolder: form.rightsHolder.trim(),
    licenseNumber: form.licenseNumber.trim(),
    rightsValidFrom: form.rightsValidFrom,
    licenseExpiresAt: form.licenseExpiresAt,
    rightsReportNumber: form.rightsReportNumber.trim(),
    rightsMaterialObjectKey: form.rightsMaterialObjectKey.trim(),
    rightsMaterialDigestSha256: form.rightsMaterialDigestSha256
      .trim()
      .toLowerCase(),
    allowsWechatDistribution: form.allowsWechatDistribution,
    allowsAdMonetization: form.allowsAdMonetization,
    allowsTranscoding: form.allowsTranscoding,
    allowsPromotionalMaterial: form.allowsPromotionalMaterial,
    episodes: form.episodes.map((episode, index) => ({
      id: episode.id,
      episodeNumber: index + 1,
      title: episode.title.trim(),
      durationSeconds: Math.max(0, Math.round(episode.durationSeconds)),
      mediaStatus: episode.mediaStatus,
    })),
  };
}

async function save(): Promise<DramaRecord | null> {
  error.value = "";
  notice.value = "";
  const payload = normalizedInput();
  const validation = dramaDraftError(
    payload,
    new Set(tagLibrary.value.filter((tag) => tag.status === CatalogTagStatus.ACTIVE).map((tag) => tag.id)),
  );
  if (validation) {
    error.value = validation;
    return null;
  }
  saving.value = true;
  try {
    const saved = await adminApi.saveDrama(payload, id.value || undefined);
    applyDrama(saved);
    notice.value =
      adminApi.mode === "mock"
        ? "已保存到当前演示会话；刷新页面后可能重置。"
        : "剧目已保存。";
    if (isNew.value) await router.replace(`/dramas/${saved.id}`);
    return saved;
  } catch (caught) {
    error.value = toErrorMessage(caught);
    return null;
  } finally {
    saving.value = false;
  }
}

async function submitReview(): Promise<void> {
  let target = drama.value;
  if (dirty.value || !target) target = await save();
  if (!target) return;
  actionBusy.value = true;
  try {
    await adminApi.submitReview(target.id);
    await refreshDrama(target.id);
    notice.value =
      adminApi.mode === "mock"
        ? "已进入演示审核队列，未提交真实审核。"
        : "已提交审核。";
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    actionBusy.value = false;
  }
}

async function refreshDrama(dramaId = id.value): Promise<void> {
  if (!dramaId) return;
  applyDrama(await adminApi.getDrama(dramaId));
}

async function confirmAction(reason: string): Promise<void> {
  if (!drama.value || !dialog.type) return;
  actionBusy.value = true;
  error.value = "";
  try {
    if (dialog.type === "publish") {
      await adminApi.publish(drama.value.id);
      notice.value =
        adminApi.mode === "mock"
          ? "演示状态已更新为已发布；未触发真实发布。"
          : "剧目已发布。";
    } else {
      await adminApi.offline(drama.value.id, reason);
      notice.value =
        adminApi.mode === "mock"
          ? "演示状态已更新为已下架；未触发真实下架。"
          : "剧目已下架。";
    }
    dialog.type = null;
    await refreshDrama();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    actionBusy.value = false;
  }
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("当前有未保存修改，确定离开吗？");
});

onMounted(load);
onUnmounted(() => {
  revokeLocalUrl("cover");
  revokeLocalUrl("promo");
});
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
          <button
            class="button button--secondary"
            type="button"
            :disabled="saving || !dirty"
            @click="save"
          >
            {{ saving ? "保存中…" : "保存草稿" }}
          </button>
        </span>
        <DramaActions
          v-if="auth.user && drama"
          :user="auth.user"
          :drama="drama"
          :gate="gate"
          :mock-mode="adminApi.mode === 'mock'"
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
        v-else-if="adminApi.mode === 'live' && !isNew"
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
              <input
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
              ><textarea
                v-model="form.summary"
                :disabled="!canEdit"
                rows="4"
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
                <button
                  class="button button--secondary button--small"
                  type="button"
                  :disabled="!canEdit"
                  @click="tagPickerOpen = true"
                >
                  选择标签
                </button>
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
                <button
                  v-if="form.coverUrl"
                  class="button button--ghost button--small"
                  type="button"
                  :disabled="!canEdit"
                  @click="clearPoster('cover')"
                >
                  移除
                </button>
              </div>
              <p>
                支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过
                10MB（建议海报尺寸 {{ DRAMA_POSTER_SIZE_HINT }}）
              </p>
              <img
                v-if="form.coverUrl"
                class="poster-preview poster-preview--drama"
                :src="form.coverUrl"
                alt="剧目海报预览"
              />
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
                <button
                  v-if="form.promoCoverUrl"
                  class="button button--ghost button--small"
                  type="button"
                  :disabled="!canEdit"
                  @click="clearPoster('promo')"
                >
                  移除
                </button>
              </div>
              <p>
                选填，支持 jpg .jpeg .bmp .png 格式，单个文件大小不超过
                10MB（建议海报尺寸 {{ PROMO_POSTER_SIZE_HINT }}）
              </p>
              <img
                v-if="form.promoCoverUrl"
                class="poster-preview poster-preview--promo"
                :src="form.promoCoverUrl"
                alt="推广海报预览"
              />
            </div>
          </div>
        </section>
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
              ><input
                v-model="form.rightsHolder"
                :disabled="!canEdit"
                :maxlength="RIGHTS_HOLDER_MAX_LENGTH"
            /></label>
            <label class="field"
              ><span>许可 / 备案编号</span
              ><input
                v-model="form.licenseNumber"
                :disabled="!canEdit"
                :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH"
            /></label>
            <label class="field"
              ><span>许可起始日</span
              ><input
                v-model="form.rightsValidFrom"
                :disabled="!canEdit"
                type="date"
            /></label>
            <label class="field"
              ><span>许可到期日</span
              ><input
                v-model="form.licenseExpiresAt"
                :disabled="!canEdit"
                type="date"
            /></label>
            <label class="field"
              ><span>报备号</span
              ><input
                v-model="form.rightsReportNumber"
                :disabled="!canEdit"
                :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH"
            /></label>
            <label class="field"
              ><span>私有材料对象键</span
              ><input
                v-model="form.rightsMaterialObjectKey"
                :disabled="!canEdit"
                :maxlength="RIGHTS_MATERIAL_KEY_MAX_LENGTH"
                placeholder="rights/…/document.pdf"
              /><small>仅填写私有对象存储键，不使用公开 URL</small></label
            >
            <label class="field field--wide"
              ><span>材料 SHA-256 摘要</span
              ><input
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
        <EpisodeTable
          :model-value="form.episodes as EpisodeRecord[]"
          :drama-id="drama?.id ?? ''"
          :readonly="!canEdit || (adminApi.mode === 'live' && !isNew)"
          @update:model-value="updateEpisodes"
        />
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

<style scoped>
.back-link {
  display: inline-block;
  margin-bottom: var(--space-3);
  color: var(--color-muted);
  font-size: 12px;
}
.title-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-muted);
  font-size: 12px;
}
.editor-grid {
  display: grid;
  gap: var(--space-3);
}
.editor-grid > .episode-panel {
  grid-column: 1 / -1;
}
.inline-message {
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid #cbd8ea;
  border-radius: 8px;
  color: #31537a;
  background: #f0f6fc;
  font-size: 12px;
}
.inline-message--error {
  border-color: #f0c0c8;
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
.inline-message--success {
  border-color: #b7dfca;
  color: var(--color-success);
  background: var(--color-success-soft);
}
.rights-hint {
  margin: 0 0 var(--space-3);
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
.rights-scope {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-3);
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 9px;
}
.rights-scope legend {
  padding: 0 var(--space-1);
  color: #344054;
  font-size: 12px;
  font-weight: 650;
}
.rights-scope label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: #344054;
  font-size: 12px;
}
.rights-scope input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
}
.field-head > span {
  line-height: 1.25;
}
.field-head .button {
  flex: 0 0 auto;
  width: auto;
}
.tag-summary {
  display: grid;
  align-content: start;
  height: calc(var(--control-height) * 2 + var(--space-2));
  padding: var(--space-2);
  overflow: auto;
  border: 1px solid #cfd7e2;
  border-radius: 8px;
  background: #fff;
}
.tag-summary__empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 400;
}
.tag-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.tag-chip {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #fff;
  color: #344054;
  font-size: 12px;
  line-height: 1.2;
}
.tag-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tag-chip--active {
  border-color: #c9d7ee;
  background: #eef4ff;
  color: var(--color-primary);
  font-weight: 650;
}
.drama-type {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.drama-type legend {
  margin: 0 0 var(--space-2);
  padding: 0;
}
.drama-type__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  font-weight: 400;
}
.drama-type__options label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: #344054;
  font-size: 13px;
}
.drama-type__options input {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  flex: 0 0 16px;
  line-height: 1;
  accent-color: var(--color-primary);
  border-radius: 50%;
}
.drama-type__hints {
  display: grid;
}
.drama-type__hint {
  grid-area: 1 / 1;
  visibility: hidden;
  font-weight: 400;
}
.drama-type__hint.is-active {
  visibility: visible;
}
.poster-row > p {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}
.poster-file {
  position: relative;
  overflow: hidden;
}
.poster-file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.poster-preview {
  width: 100%;
  max-width: 180px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  object-fit: cover;
  background: #f5f7fa;
}
.poster-preview--drama {
  aspect-ratio: 816 / 1086;
}
.poster-preview--promo {
  max-width: 280px;
  aspect-ratio: 762 / 318;
}
@media (min-width: 1180px) {
  .editor-grid {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}
@media (max-width: 560px) {
  .rights-scope {
    grid-template-columns: 1fr;
  }
}
</style>
