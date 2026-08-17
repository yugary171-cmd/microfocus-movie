<script setup lang="ts">
import Icon from "./Icon.vue";
import {
  DRAMA_EPISODE_MAX_COUNT,
  EPISODE_DURATION_SECONDS_MAX,
  EPISODE_TITLE_MAX_LENGTH,
  MediaStatus,
  UPLOAD_FILE_ACCEPT,
} from "@microfocus/contracts";
import { computed, reactive } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import { uploadFileError } from "@/policies/drama-input";
import { formatDuration, mediaStatusLabels } from "@/i18n";
import type { EpisodeRecord, UploadProgress } from "@/types/admin";
import StatusBadge from "./StatusBadge.vue";

const props = defineProps<{
  modelValue: EpisodeRecord[];
  dramaId: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: EpisodeRecord[]] }>();
const uploads = reactive<Record<string, UploadProgress>>({});

const sortedEpisodes = computed(() => [...props.modelValue].sort((a, b) => a.episodeNumber - b.episodeNumber));

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
      title: `第 ${nextNumber} 集`,
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
</script>

<template>
  <section class="panel episode-panel" aria-labelledby="episodes-title">
    <div class="panel__header">
      <div><p class="eyebrow">EPISODES & VOD</p><h2 id="episodes-title">剧集与媒体</h2><p>先获取上传签名，再由浏览器直传 VOD；应用服务不转发视频文件。</p></div>
      <button v-if="!readonly" class="button button--secondary" type="button" :disabled="modelValue.length >= DRAMA_EPISODE_MAX_COUNT" @click="addEpisode"><Icon name="add" />添加剧集</button>
    </div>
    <div v-if="adminApi.mode === 'mock'" class="upload-mode" role="status">
      <strong>模拟直传</strong> 进度和处理状态仅用于演示，不代表云端已收到或完成转码。
    </div>
    <div v-else class="upload-mode upload-mode--blocked" role="alert">
      <strong>真实上传未配置</strong> 腾讯云 VOD 直传 SDK 与 fileId 注册链路尚未接通；本页不会上传文件或显示虚假成功。
    </div>
    <div v-if="sortedEpisodes.length === 0" class="episode-empty" role="status">
            <Icon name="add" /><strong>尚未添加剧集</strong><small>添加后可填写标题、时长并选择视频文件。</small>
    </div>
    <div v-else class="episode-list">
      <article v-for="episode in sortedEpisodes" :key="episode.id" class="episode-row">
        <div class="episode-number">{{ String(episode.episodeNumber).padStart(2, "0") }}</div>
        <div class="episode-fields">
          <label class="field"><span>集标题</span><input :value="episode.title" :disabled="readonly" :maxlength="EPISODE_TITLE_MAX_LENGTH" required @input="update(episode.id, { title: ($event.target as HTMLInputElement).value })" /></label>
          <label class="field field--duration"><span>时长（秒）</span><input :value="episode.durationSeconds" :disabled="readonly" type="number" min="1" :max="EPISODE_DURATION_SECONDS_MAX" step="1" @input="update(episode.id, { durationSeconds: Number(($event.target as HTMLInputElement).value) || 0 })" /><small>{{ formatDuration(episode.durationSeconds) }}</small></label>
        </div>
        <div class="episode-media">
          <StatusBadge :label="mediaStatusLabels[episode.mediaStatus]" :tone="statusTone(episode.mediaStatus)" />
          <template v-if="uploads[episode.id]">
            <div v-if="uploads[episode.id]?.state === 'uploading' || uploads[episode.id]?.state === 'signing'" class="upload-progress" role="status" aria-live="polite">
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
              >模拟处理完成并通过审核</button>
            </div>
            <div v-else-if="uploads[episode.id]?.state === 'error'" class="upload-error" role="alert">
              <span>{{ uploads[episode.id]?.error }}</span>
              <button class="link" type="button" @click="startUpload(episode)">重试上传</button>
            </div>
          </template>
        </div>
        <div v-if="!readonly" class="episode-actions">
          <label class="button button--secondary button--small upload-button">
            选择视频
            <input type="file" :accept="UPLOAD_FILE_ACCEPT" @change="chooseFile(episode, $event)" />
          </label>
          <button class="button button--ghost button--small" type="button" :disabled="uploads[episode.id]?.state === 'uploading'" @click="removeEpisode(episode.id)">移除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel__header p:last-child { margin: 3px 0 0; color: var(--color-muted); font-size: 12px; }
.upload-mode { margin-bottom: 14px; padding: 9px 11px; border: 1px solid #f1d18e; border-radius: 8px; color: #71450a; background: #fff8e8; font-size: 12px; }
.upload-mode--blocked { border-color: #f0c0c8; color: var(--color-danger); background: var(--color-danger-soft); }
.episode-empty { display: flex; min-height: 150px; align-items: center; justify-content: center; flex-direction: column; border: 1px dashed #cbd4e0; border-radius: 10px; color: var(--color-muted); background: #fafbfd; }
.episode-empty > span { display: grid; width: 36px; height: 36px; place-items: center; margin-bottom: 8px; border-radius: 50%; color: var(--color-primary); background: var(--color-primary-soft); font-size: 20px; }
.episode-list { display: grid; gap: 9px; }
.episode-row { display: grid; grid-template-columns: 44px minmax(240px, 1.2fr) minmax(190px, .8fr) auto; align-items: center; gap: 13px; padding: 12px; border: 1px solid var(--color-border); border-radius: 10px; }
.episode-number { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 9px; color: var(--color-primary); background: var(--color-primary-soft); font-size: 13px; font-weight: 800; }
.episode-fields { display: grid; grid-template-columns: minmax(150px, 1fr) 105px; gap: 9px; }
.field--duration { position: relative; }
.field--duration small { position: absolute; right: 7px; bottom: -17px; font-size: 10px; }
.episode-media { display: flex; min-width: 0; align-items: flex-start; flex-direction: column; gap: 5px; }
.episode-actions { display: flex; gap: 4px; }
.upload-button { position: relative; overflow: hidden; cursor: pointer; }
.upload-button input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.upload-progress { display: flex; width: 100%; flex-direction: column; gap: 2px; }
.upload-progress > span { display: block; width: 100%; height: 4px; overflow: hidden; border-radius: 99px; background: #e7ebf0; }
.upload-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width .15s ease; }
.upload-success { color: var(--color-success); font-size: 10px; }
.upload-error { display: flex; flex-direction: column; color: var(--color-danger); font-size: 10px; }
.upload-error .link { width: fit-content; font-size: 10px; }
@media (max-width: 1120px) { .episode-row { grid-template-columns: 44px 1fr auto; } .episode-media { grid-column: 2 / 3; } .episode-actions { grid-column: 3; grid-row: 1 / 3; flex-direction: column; } }
@media (max-width: 640px) { .episode-row { grid-template-columns: 38px minmax(0, 1fr); } .episode-number { grid-row: 1; } .episode-fields { grid-template-columns: 1fr; } .episode-media, .episode-actions { grid-column: 2; grid-row: auto; } .episode-actions { flex-direction: row; } }
</style>
