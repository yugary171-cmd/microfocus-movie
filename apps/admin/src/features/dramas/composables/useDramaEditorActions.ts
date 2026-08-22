import { normalizeDramaTypeCategory } from "@microfocus/contracts";
import { useRouter } from "vue-router";
import { toErrorMessage } from "@/infrastructure/api";
import { dramasApi } from "@/features/dramas/api";
import { dramaActionMessages } from "@/features/dramas/constants";
import { dramaDraftError } from "@/policies/drama-input";
import type { DramaInput, DramaRecord } from "@/shared/types";
import type { DramaEditorData } from "./useDramaEditorData";
import type { DramaEditorState } from "./useDramaEditorState";

export function useDramaEditorActions(state: DramaEditorState, data: DramaEditorData) {
  const router = useRouter();

  function normalizedInput(): DramaInput {
    return {
      ...state.form,
      title: state.form.title.trim(),
      summary: state.form.summary.trim(),
      category: normalizeDramaTypeCategory(state.form.category),
      tagIds: [...state.form.tagIds],
      coverUrl: state.form.coverUrl.trim(),
      promoCoverUrl: state.form.promoCoverUrl.trim(),
      rightsHolder: state.form.rightsHolder.trim(),
      licenseNumber: state.form.licenseNumber.trim(),
      rightsValidFrom: state.form.rightsValidFrom,
      licenseExpiresAt: state.form.licenseExpiresAt,
      rightsReportNumber: state.form.rightsReportNumber.trim(),
      rightsMaterialObjectKey: state.form.rightsMaterialObjectKey.trim(),
      rightsMaterialDigestSha256: state.form.rightsMaterialDigestSha256.trim().toLowerCase(),
      allowsWechatDistribution: state.form.allowsWechatDistribution,
      allowsAdMonetization: state.form.allowsAdMonetization,
      allowsTranscoding: state.form.allowsTranscoding,
      allowsPromotionalMaterial: state.form.allowsPromotionalMaterial,
      episodes: state.form.episodes.map((episode, index) => ({
        id: episode.id,
        episodeNumber: index + 1,
        title: episode.title.trim(),
        durationSeconds: Math.max(0, Math.round(episode.durationSeconds)),
        mediaStatus: episode.mediaStatus,
      })),
    };
  }

  async function save(): Promise<DramaRecord | null> {
    state.error.value = "";
    state.notice.value = "";
    const payload = normalizedInput();
    const validation = dramaDraftError(payload, data.activeTagIds());
    if (validation) {
      state.error.value = validation;
      return null;
    }
    state.saving.value = true;
    try {
      const posterUploads = {
        ...(state.posterUploadIds.cover ? { coverUploadId: state.posterUploadIds.cover } : {}),
        ...(state.posterUploadIds.promo ? { promoUploadId: state.posterUploadIds.promo } : {}),
      };
      const saved = Object.keys(posterUploads).length > 0
        ? await dramasApi.saveDrama(payload, state.id.value || undefined, posterUploads)
        : await dramasApi.saveDrama(payload, state.id.value || undefined);
      data.applyDrama(saved);
      state.notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockSaved : dramaActionMessages.saved;
      if (state.isNew.value) await router.replace(`/dramas/${saved.id}`);
      return saved;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
      return null;
    } finally {
      state.saving.value = false;
    }
  }

  async function submitReview(): Promise<void> {
    let target = state.drama.value;
    if (state.dirty.value || !target) target = await save();
    if (!target) return;
    state.actionBusy.value = true;
    try {
      await dramasApi.submitReview(target.id);
      await data.refreshDrama(target.id);
      state.notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockReviewSubmitted : dramaActionMessages.reviewSubmitted;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.actionBusy.value = false;
    }
  }

  async function confirmAction(reason: string): Promise<void> {
    if (!state.drama.value || !state.dialog.type) return;
    state.actionBusy.value = true;
    state.error.value = "";
    try {
      if (state.dialog.type === "publish") {
        await dramasApi.publish(state.drama.value.id);
        state.notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockPublished : dramaActionMessages.published;
      } else {
        await dramasApi.offline(state.drama.value.id, reason);
        state.notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockOffline : dramaActionMessages.offline;
      }
      state.dialog.type = null;
      await data.refreshDrama();
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.actionBusy.value = false;
    }
  }

  return { save, submitReview, confirmAction };
}

export type DramaEditorActions = ReturnType<typeof useDramaEditorActions>;
