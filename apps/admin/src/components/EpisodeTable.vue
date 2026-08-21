<script setup lang="ts">
import Icon from "./Icon.vue";
import { ElInput as ElementInput } from "element-plus";
import {
  DRAMA_EPISODE_MAX_COUNT,
  EPISODE_DURATION_SECONDS_MAX,
  EPISODE_TITLE_MAX_LENGTH,
  MediaStatus,
  UPLOAD_FILE_ACCEPT,
} from "@microfocus/contracts";
import { computed, onUnmounted, reactive, ref, watch, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import { uploadFileError } from "@/policies/drama-input";
import { formatDuration, mediaStatusLabels } from "@/i18n";
import type { EpisodeRecord, UploadProgress } from "@/types/admin";
import ConfirmDialog from "./ConfirmDialog.vue";
import StatusBadge from "./StatusBadge.vue";

const ElInput = ElementInput as Component;

const props = defineProps<{
  modelValue: EpisodeRecord[];
  dramaId: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: EpisodeRecord[]] }>();
const uploads = reactive<Record<string, UploadProgress>>({});
const drawerOpen = ref(false);
const closeConfirmOpen = ref(false);

const sortedEpisodes = computed(() => [...props.modelValue].sort((a, b) => a.episodeNumber - b.episodeNumber));
const readyCount = computed(() => props.modelValue.filter((episode) => episode.mediaStatus === MediaStatus.READY).length);
const uploadBusy = computed(() =>
  Object.values(uploads).some((item) => item?.state === "uploading" || item?.state === "signing"),
);
const summaryText = computed(() => {
  if (props.modelValue.length === 0) return "尚未添加剧集";
  return `已添加 ${props.modelValue.length} 集 · ${readyCount.value} 集媒体就绪`;
});

function update(id: string, patch: Partial<EpisodeRecord>): void {
  emit("update:modelValue", props.modelValue.map((episode) => (episode.id === id ? { ...episode, ...patch } : episode)));
}

function addEpisode(): void {
  if (props.modelValue.length >= DRAMA_EPISODE_MAX_COUNT) return;
  const nextNumber = props.modelValue.reduce((max, episode) => Math.max(max, episode.episodeNumber), 0) + 1;
  emit("update:modelValue", [
    ...props.modelValue,
    {
      id: `local-${crypto.randomUUID()}`,
      episodeNumber: nextNumber,
      title: "",
      durationSeconds: 0,
      mediaStatus: MediaStatus.CREATED,
      transcodeStatus: "PENDING",
      machineReviewStatus: "PENDING",
      manualReviewStatus: "PENDING",
      wechatReviewStatus: "PENDING",
      updatedAt: new Date().toISOString(),
    },
  ]);
}

function removeEpisode(id: string): void {
  emit("update:modelValue", props.modelValue.filter((episode) => episode.id !== id));
  delete uploads[id];
}

function chooseFile(episode: EpisodeRecord, event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fileError = uploadFileError(file);
  if (fileError) {
    uploads[episode.id] = { state: "error", progress: 0, error: fileError, file };
    return;
  }
  uploads[episode.id] = { state: "idle", progress: 0, error: "", file };
  void startUpload(episode);
  input.value = "";
}

async function startUpload(episode: EpisodeRecord): Promise<void> {
  const state = uploads[episode.id];
  const file = state?.file;
  if (!state || !file) return;
  state.state = "signing";
  state.progress = 0;
  state.error = "";
  update(episode.id, { mediaStatus: MediaStatus.UPLOADING });
  try {
    state.state = "uploading";
    await adminApi.uploadEpisode(props.dramaId || "unsaved-draft", episode.id, file, (progress) => {
      state.progress = progress;
    });
    state.state = "success";
    state.progress = 100;
    update(episode.id, { mediaStatus: MediaStatus.PROCESSING, updatedAt: new Date().toISOString() });
  } catch (caught) {
    state.state = "error";
    state.error = toErrorMessage(caught);
    update(episode.id, { mediaStatus: MediaStatus.FAILED });
  }
}

function statusTone(status: MediaStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  if (status === MediaStatus.READY) return "success";
  if (status === MediaStatus.FAILED || status === MediaStatus.REVIEW_REJECTED) return "danger";
  if (status === MediaStatus.CREATED) return "neutral";
  if (status === MediaStatus.PENDING_MANUAL_REVIEW || status === MediaStatus.PENDING_WECHAT) return "warning";
  return "info";
}

function completeMockProcessing(episode: EpisodeRecord): void {
  if (adminApi.mode !== "mock" || uploads[episode.id]?.state !== "success") return;
  update(episode.id, {
    mediaStatus: MediaStatus.READY,
    transcodeStatus: "READY",
    machineReviewStatus: "APPROVED",
    manualReviewStatus: "APPROVED",
    wechatReviewStatus: "APPROVED",
    vodFileId: episode.vodFileId ?? `mock-vod-${crypto.randomUUID()}`,
    updatedAt: new Date().toISOString(),
  });
}

function openDrawer(): void {
  drawerOpen.value = true;
}

function requestClose(): void {
  if (uploadBusy.value) {
    closeConfirmOpen.value = true;
    return;
  }
  drawerOpen.value = false;
}

function confirmClose(): void {
  closeConfirmOpen.value = false;
  drawerOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && !closeConfirmOpen.value) requestClose();
}

const previousBodyPadding = ref("");

watch(drawerOpen, (open) => {
  if (open) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    previousBodyPadding.value = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    document.addEventListener("keydown", onKeydown);
    return;
  }
  document.body.style.overflow = "";
  document.body.style.paddingRight = previousBodyPadding.value;
  document.removeEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = previousBodyPadding.value;
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <section class="panel episode-panel" aria-labelledby="episodes-title">
    <div class="panel__header">
      <div>
        <p class="eyebrow">EPISODES & VOD</p>
        <h2 id="episodes-title">剧集与媒体</h2>
        <p>先获取上传签名，再由浏览器直传 VOD；应用服务不转发视频文件。</p>
      </div>
      <button class="button button--secondary" type="button" @click="openDrawer">管理剧集</button>
    </div>
    <div v-if="adminApi.mode === 'mock'" class="upload-mode" role="status">
      <strong>模拟直传</strong> 进度和处理状态仅用于演示，不代表云端已收到或完成转码。
    </div>
    <div v-else class="upload-mode upload-mode--blocked" role="alert">
      <strong>真实上传未配置</strong> 腾讯云 VOD 直传 SDK 与 fileId 注册链路尚未接通；本页不会上传文件或显示虚假成功。
    </div>
    <p class="episode-summary">{{ summaryText }}</p>
  </section>

  <div v-if="drawerOpen" class="episode-drawer-backdrop" @click.self="requestClose" />
  <aside
    v-if="drawerOpen"
    class="episode-drawer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="episode-drawer-title"
  >
    <div class="episode-drawer__header">
      <div>
        <h2 id="episode-drawer-title">管理剧集</h2>
        <p>{{ summaryText }}，最多 {{ DRAMA_EPISODE_MAX_COUNT }} 集。</p>
      </div>
      <div class="episode-drawer__actions">
        <button
          v-if="!readonly"
          class="button button--secondary"
          type="button"
          :disabled="modelValue.length >= DRAMA_EPISODE_MAX_COUNT"
          @click="addEpisode"
        >
          <Icon name="add" />添加剧集
        </button>
        <button class="icon-button" type="button" aria-label="关闭" @click="requestClose">
          <Icon name="close" />
        </button>
      </div>
    </div>
    <div v-if="sortedEpisodes.length === 0" class="episode-empty" role="status">
      <Icon name="add" />
      <strong>尚未添加剧集</strong>
      <small>{{ readonly ? "当前没有可查看的剧集。" : "添加后可填写标题、时长并选择视频文件。" }}</small>
    </div>
    <div v-else class="episode-table-wrap table-wrap table-wrap--sticky-actions">
      <table class="episode-table">
        <thead>
          <tr>
            <th>集数</th>
            <th>标题</th>
            <th>时长（秒）</th>
            <th>状态</th>
            <th v-if="!readonly">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="episode in sortedEpisodes" :key="episode.id">
            <td class="episode-number-cell">{{ String(episode.episodeNumber).padStart(2, "0") }}</td>
            <td>
              <el-input
                class="admin-input episode-title-input"
                type="text"
                :value="episode.title"
                :disabled="readonly"
                :maxlength="EPISODE_TITLE_MAX_LENGTH"
                :placeholder="`第 ${episode.episodeNumber} 集`"
                @input="update(episode.id, { title: ($event.target as HTMLInputElement).value })"
              />
            </td>
            <td class="episode-duration-cell">
              <div class="episode-duration">
                <el-input
                  class="admin-input episode-duration-input"
                  :value="episode.durationSeconds || ''"
                  :disabled="readonly"
                  type="number"
                  min="1"
                  :max="EPISODE_DURATION_SECONDS_MAX"
                  step="1"
                  :placeholder="'秒'"
                  @input="update(episode.id, { durationSeconds: Number(($event.target as HTMLInputElement).value) || 0 })"
                />
                <span>{{ formatDuration(episode.durationSeconds) }}</span>
              </div>
            </td>
            <td class="episode-status-cell">
              <StatusBadge :label="mediaStatusLabels[episode.mediaStatus]" :tone="statusTone(episode.mediaStatus)" />
              <template v-if="uploads[episode.id]">
                <div
                  v-if="uploads[episode.id]?.state === 'uploading' || uploads[episode.id]?.state === 'signing'"
                  class="upload-progress"
                  role="status"
                  aria-live="polite"
                >
                  <span><i :style="{ width: `${uploads[episode.id]?.progress ?? 0}%` }" /></span>
                  <small>{{ uploads[episode.id]?.state === "signing" ? "正在获取签名…" : `上传 ${uploads[episode.id]?.progress ?? 0}%` }}</small>
                </div>
                <div v-else-if="uploads[episode.id]?.state === 'success'" class="upload-success" role="status">
                  <span>已完成模拟直传，等待媒体处理</span>
                  <button
                    v-if="adminApi.mode === 'mock' && episode.mediaStatus !== MediaStatus.READY"
                    class="link"
                    type="button"
                    @click="completeMockProcessing(episode)"
                  >
                    模拟处理完成并通过审核
                  </button>
                </div>
                <div v-else-if="uploads[episode.id]?.state === 'error'" class="upload-error" role="alert">
                  <span>{{ uploads[episode.id]?.error }}</span>
                  <button class="link" type="button" @click="startUpload(episode)">重试上传</button>
                </div>
              </template>
            </td>
            <td v-if="!readonly">
              <div class="table-actions">
                <label class="button button--secondary button--small upload-button">
                  选择视频
                  <input type="file" :accept="UPLOAD_FILE_ACCEPT" @change="chooseFile(episode, $event)" />
                </label>
                <button
                  class="button button--ghost button--small"
                  type="button"
                  :disabled="uploads[episode.id]?.state === 'uploading'"
                  @click="removeEpisode(episode.id)"
                >
                  移除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </aside>

  <ConfirmDialog
    :open="closeConfirmOpen"
    title="正在上传"
    message="有剧集正在上传。关闭抽屉后上传仍会继续，可再次打开查看进度。"
    confirm-label="仍要关闭"
    :busy="false"
    @close="closeConfirmOpen = false"
    @confirm="confirmClose"
  />
</template>

<style scoped>
.panel__header p:last-child { margin: var(--space-1) 0 0; color: var(--color-muted); font-size: 12px; }
.upload-mode { margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid #f1d18e; border-radius: 8px; color: #71450a; background: #fff8e8; font-size: 12px; }
.upload-mode--blocked { border-color: #f0c0c8; color: var(--color-danger); background: var(--color-danger-soft); }
.episode-summary { margin: 0; color: var(--color-muted); font-size: 12px; font-weight: 400; }
.episode-drawer-backdrop {
  position: fixed;
  z-index: 90;
  inset: 0;
  background: rgba(13, 21, 35, 0.42);
}
.episode-drawer {
  position: fixed;
  z-index: 91;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  width: max(50vw, 720px);
  max-width: 100vw;
  flex-direction: column;
  background: #fff;
  box-shadow: var(--shadow-md);
}
.episode-drawer__header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.episode-drawer__header h2 { margin-bottom: var(--space-1); }
.episode-drawer__header p { margin: 0; color: var(--color-muted); font-size: 12px; }
.episode-drawer__actions { display: flex; align-items: center; gap: var(--space-2); }
.episode-empty {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: var(--space-4);
  border: 1px dashed #cbd4e0;
  border-radius: 10px;
  color: var(--color-muted);
  background: #fafbfd;
}
.episode-empty :deep(.app-icon) { margin-bottom: var(--space-2); }
.episode-table-wrap {
  flex: 1;
  min-height: 0;
  margin: var(--space-4);
  overflow: auto;
}
.episode-table { min-width: 720px; }
.episode-table th,
.episode-table td {
  padding: var(--space-1) var(--space-2);
  vertical-align: middle;
}
.episode-table thead th {
  position: sticky;
  top: 0;
  z-index: 4;
}
.episode-table-wrap.table-wrap--sticky-actions thead th:last-child { z-index: 5; }
.episode-number-cell { width: 48px; color: var(--color-primary); font-weight: 800; }
.episode-title-input { min-width: 120px; }
.episode-duration-cell { width: 148px; }
.episode-duration {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.episode-duration-input {
  width: 80px;
  flex: 0 0 80px;
  min-width: 80px;
}
.episode-duration span {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
}
.episode-status-cell { min-width: 148px; }
.episode-table input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(41, 82, 204, 0.12); }
.upload-button { position: relative; overflow: hidden; cursor: pointer; }
.upload-button input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.upload-progress { display: flex; width: 100%; flex-direction: column; gap: var(--space-1); margin-top: var(--space-1); }
.upload-progress > span { display: block; width: 100%; height: 4px; overflow: hidden; border-radius: 99px; background: #e7ebf0; }
.upload-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width .15s ease; }
.upload-success, .upload-error { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-1); font-size: 12px; font-weight: 400; }
.upload-success { color: var(--color-success); }
.upload-error { color: var(--color-danger); }
.upload-error .link, .upload-success .link { width: fit-content; font-size: 12px; }
@media (max-width: 720px) {
  .episode-drawer { width: 100vw; min-width: 0; }
}
</style>
