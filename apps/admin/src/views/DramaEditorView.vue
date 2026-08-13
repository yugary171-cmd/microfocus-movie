<script setup lang="ts">
import { AdminRole, DramaStatus, MediaStatus, type ReleaseGateStatus } from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import DramaActions from "@/components/DramaActions.vue";
import EpisodeTable from "@/components/EpisodeTable.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { dramaStatusLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { DramaInput, DramaRecord, EpisodeRecord } from "@/types/admin";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const id = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
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
  tags: [],
  coverUrl: "",
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
const tagsText = ref("");

const canEdit = computed(() => {
  if (!auth.user) return false;
  return auth.user.role === AdminRole.EDITOR && (isNew.value || drama.value?.ownerId === auth.user.id);
});

function applyDrama(value: DramaRecord): void {
  drama.value = value;
  Object.assign(form, {
    title: value.title ?? "",
    summary: value.summary ?? "",
    category: value.category ?? "",
    tags: Array.isArray(value.tags) ? value.tags : [],
    coverUrl: value.coverUrl ?? "",
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
  tagsText.value = form.tags.join("，");
  dirty.value = false;
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
    const [gateResult, dramaResult] = await Promise.all([
      adminApi.releaseGate(),
      isNew.value ? Promise.resolve(null) : adminApi.getDrama(id.value),
    ]);
    gate.value = gateResult;
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
    category: form.category.trim(),
    tags: tagsText.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
    coverUrl: form.coverUrl.trim(),
    rightsHolder: form.rightsHolder.trim(),
    licenseNumber: form.licenseNumber.trim(),
    rightsValidFrom: form.rightsValidFrom,
    licenseExpiresAt: form.licenseExpiresAt,
    rightsReportNumber: form.rightsReportNumber.trim(),
    rightsMaterialObjectKey: form.rightsMaterialObjectKey.trim(),
    rightsMaterialDigestSha256: form.rightsMaterialDigestSha256.trim().toLowerCase(),
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
  saving.value = true;
  try {
    const saved = await adminApi.saveDrama(normalizedInput(), id.value || undefined);
    applyDrama(saved);
    notice.value = adminApi.mode === "mock" ? "已保存到当前演示会话；刷新页面后可能重置。" : "剧目已保存。";
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
    notice.value = adminApi.mode === "mock" ? "已进入演示审核队列，未提交真实审核。" : "已提交审核。";
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
      notice.value = adminApi.mode === "mock" ? "演示状态已更新为已发布；未触发真实发布。" : "剧目已发布。";
    } else {
      await adminApi.offline(drama.value.id, reason);
      notice.value = adminApi.mode === "mock" ? "演示状态已更新为已下架；未触发真实下架。" : "剧目已下架。";
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
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <RouterLink class="back-link" to="/dramas">← 返回剧目列表</RouterLink>
        <p class="eyebrow">{{ isNew ? "NEW CONTENT" : "CONTENT DETAIL" }}</p>
        <h1>{{ isNew ? "新建剧目" : drama?.title || "剧目详情" }}</h1>
        <div v-if="drama" class="title-meta"><StatusBadge :label="dramaStatusLabels[drama.status]" :tone="drama.status === DramaStatus.PUBLISHED || drama.status === DramaStatus.READY ? 'success' : drama.status === DramaStatus.OFFLINE ? 'danger' : 'warning'" /><span>负责人：{{ drama.ownerName }}</span></div>
      </div>
      <div class="page-header__actions">
        <button v-if="canEdit" class="button button--secondary" type="button" :disabled="saving || !dirty" @click="save">{{ saving ? "保存中…" : "保存草稿" }}</button>
        <DramaActions v-if="auth.user && drama" :user="auth.user" :drama="drama" :gate="gate" :busy="actionBusy || saving" @submit="submitReview" @publish="dialog.type = 'publish'" @offline="dialog.type = 'offline'" />
      </div>
    </header>
    <PageState v-if="loading" type="loading" message="正在加载剧目、许可与发布闸门…" />
    <PageState v-else-if="error && !drama && !isNew" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" class="inline-message inline-message--error" role="alert">{{ error }}</div>
      <div v-if="notice" class="inline-message inline-message--success" role="status">{{ notice }}</div>
      <div v-if="!canEdit" class="inline-message" role="status">当前角色为只读视图；审核、发布或下架请使用页面顶部的授权操作。</div>
      <div v-else-if="adminApi.mode === 'live' && !isNew" class="inline-message" role="status">当前 API 仅支持更新既有剧目的元数据与新增版权版本；分集标题、时长和媒体保持只读。</div>
      <div class="editor-grid" @input="inputChanged" @change="inputChanged">
        <section class="panel" aria-labelledby="metadata-title">
          <div class="panel__header"><div><p class="eyebrow">METADATA</p><h2 id="metadata-title">基础信息</h2></div></div>
          <div class="form-grid">
            <label class="field"><span>剧名 *</span><input v-model="form.title" :disabled="!canEdit" maxlength="80" required /></label>
            <label class="field"><span>分类 *</span><input v-model="form.category" :disabled="!canEdit" maxlength="40" placeholder="如：都市情感" required /></label>
            <label class="field field--wide"><span>简介 *</span><textarea v-model="form.summary" :disabled="!canEdit" rows="4" maxlength="500" required /></label>
            <label class="field"><span>标签</span><input v-model="tagsText" :disabled="!canEdit" placeholder="使用逗号分隔" /><small>最多建议 5 个</small></label>
            <label class="field"><span>封面 URL</span><input v-model="form.coverUrl" :disabled="!canEdit" type="url" placeholder="https://…" /></label>
          </div>
        </section>
        <section class="panel" aria-labelledby="rights-title">
          <div class="panel__header"><div><p class="eyebrow">RIGHTS & LICENSE</p><h2 id="rights-title">版权与许可</h2></div><StatusBadge :label="form.licenseNumber && form.rightsHolder ? '资料已填写' : '待补齐'" :tone="form.licenseNumber && form.rightsHolder ? 'success' : 'warning'" /></div>
          <div class="form-grid">
            <label class="field"><span>权利方 *</span><input v-model="form.rightsHolder" :disabled="!canEdit" required /></label>
            <label class="field"><span>许可 / 备案编号 *</span><input v-model="form.licenseNumber" :disabled="!canEdit" required /></label>
            <label class="field"><span>许可起始日 *</span><input v-model="form.rightsValidFrom" :disabled="!canEdit" type="date" required /></label>
            <label class="field"><span>许可到期日 *</span><input v-model="form.licenseExpiresAt" :disabled="!canEdit" type="date" required /></label>
            <label class="field"><span>报备号 *</span><input v-model="form.rightsReportNumber" :disabled="!canEdit" required /></label>
            <label class="field"><span>私有材料对象键 *</span><input v-model="form.rightsMaterialObjectKey" :disabled="!canEdit" required placeholder="rights/…/document.pdf" /><small>仅填写私有对象存储键，不使用公开 URL</small></label>
            <label class="field field--wide"><span>材料 SHA-256 摘要 *</span><input v-model="form.rightsMaterialDigestSha256" :disabled="!canEdit" required minlength="64" maxlength="64" pattern="[A-Fa-f0-9]{64}" spellcheck="false" autocomplete="off" placeholder="64 位十六进制摘要" /></label>
            <fieldset class="rights-scope field--wide" :disabled="!canEdit">
              <legend>授权范围（须逐项确认）</legend>
              <label><input v-model="form.allowsWechatDistribution" type="checkbox" required /> 允许微信分发</label>
              <label><input v-model="form.allowsAdMonetization" type="checkbox" required /> 允许广告变现</label>
              <label><input v-model="form.allowsTranscoding" type="checkbox" required /> 允许媒体转码</label>
              <label><input v-model="form.allowsPromotionalMaterial" type="checkbox" required /> 允许制作宣传材料</label>
            </fieldset>
          </div>
        </section>
        <EpisodeTable :model-value="form.episodes as EpisodeRecord[]" :drama-id="drama?.id ?? ''" :readonly="!canEdit || (adminApi.mode === 'live' && !isNew)" @update:model-value="updateEpisodes" />
      </div>
    </template>
    <ConfirmDialog :open="dialog.type === 'publish'" title="确认发布剧目" message="发布前将由服务端再次校验合规闸门、内容审核、版权与媒体状态。确认继续？" confirm-label="确认发布" :busy="actionBusy" @close="dialog.type = null" @confirm="confirmAction" />
    <ConfirmDialog :open="dialog.type === 'offline'" title="确认下架剧目" message="下架会阻止新的播放租约，并可能影响正在观看的用户。请说明原因。" confirm-label="确认下架" tone="danger" require-reason reason-label="下架原因" :busy="actionBusy" @close="dialog.type = null" @confirm="confirmAction" />
  </div>
</template>

<style scoped>
.back-link { display: inline-block; margin-bottom: 12px; color: var(--color-muted); font-size: 12px; }
.title-meta { display: flex; align-items: center; gap: 10px; color: var(--color-muted); font-size: 12px; }
.editor-grid { display: grid; gap: 18px; }
.editor-grid > .episode-panel { grid-column: 1 / -1; }
.inline-message { margin-bottom: 15px; padding: 10px 13px; border: 1px solid #cbd8ea; border-radius: 8px; color: #31537a; background: #f0f6fc; font-size: 12px; }
.inline-message--error { border-color: #f0c0c8; color: var(--color-danger); background: var(--color-danger-soft); }
.inline-message--success { border-color: #b7dfca; color: var(--color-success); background: var(--color-success-soft); }
.rights-scope { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 9px; }
.rights-scope legend { padding: 0 5px; color: #344054; font-size: 12px; font-weight: 650; }
.rights-scope label { display: flex; align-items: center; gap: 7px; color: #344054; font-size: 12px; }
.rights-scope input { width: 16px; height: 16px; accent-color: var(--color-primary); }
@media (min-width: 1180px) { .editor-grid { grid-template-columns: 1fr 1fr; align-items: start; } }
@media (max-width: 560px) { .rights-scope { grid-template-columns: 1fr; } }
</style>
