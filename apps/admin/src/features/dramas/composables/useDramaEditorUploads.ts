import { toErrorMessage } from "@/infrastructure/api";
import { dramasApi } from "@/features/dramas/api";
import { dramaActionMessages } from "@/features/dramas/constants";
import { posterFileError } from "@/policies/drama-input";
import type { DramaEditorState } from "./useDramaEditorState";

export function useDramaEditorUploads(state: DramaEditorState) {
  function revokeLocalUrl(kind: "cover" | "promo"): void {
    const current = state.localPosterUrls[kind];
    if (current) URL.revokeObjectURL(current);
    state.localPosterUrls[kind] = "";
  }

  async function choosePoster(kind: "cover" | "promo", event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !state.canEdit.value) return;
    const validation = posterFileError(file);
    if (validation) {
      state.error.value = validation;
      return;
    }
    if (dramasApi.mode === "live") {
      if (!state.uploadCapabilities.value.posterStorageReady) {
        state.error.value = state.uploadCapabilities.value.reasons.posterStorage || "海报对象存储尚未配置";
        return;
      }
      state.posterUploadProgress[kind] = 1;
      state.error.value = "";
      try {
        const uploaded = await dramasApi.uploadPoster(state.id.value, kind, file, (progress) => {
          state.posterUploadProgress[kind] = progress;
        });
        revokeLocalUrl(kind);
        state.posterUploadIds[kind] = uploaded.uploadId;
        if (kind === "cover") state.form.coverUrl = uploaded.assetUrl;
        else state.form.promoCoverUrl = uploaded.assetUrl;
        state.inputChanged();
        state.notice.value = kind === "cover" ? dramaActionMessages.coverUploaded : dramaActionMessages.promoCoverUploaded;
      } catch (caught) {
        state.error.value = toErrorMessage(caught);
      } finally {
        state.posterUploadProgress[kind] = 0;
      }
      return;
    }
    revokeLocalUrl(kind);
    const objectUrl = URL.createObjectURL(file);
    state.localPosterUrls[kind] = objectUrl;
    if (kind === "cover") state.form.coverUrl = objectUrl;
    else state.form.promoCoverUrl = objectUrl;
    state.inputChanged();
  }

  function clearPoster(kind: "cover" | "promo"): void {
    if (!state.canEdit.value) return;
    revokeLocalUrl(kind);
    if (kind === "cover") state.form.coverUrl = "";
    else state.form.promoCoverUrl = "";
    state.posterUploadIds[kind] = "";
    state.inputChanged();
  }

  function dispose(): void {
    revokeLocalUrl("cover");
    revokeLocalUrl("promo");
  }

  return { choosePoster, clearPoster, dispose };
}

export type DramaEditorUploads = ReturnType<typeof useDramaEditorUploads>;
