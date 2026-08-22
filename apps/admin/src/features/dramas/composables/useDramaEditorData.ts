import { CatalogTagStatus, normalizeDramaTypeCategory } from "@microfocus/contracts";
import { toErrorMessage } from "@/infrastructure/api";
import { dramasApi } from "@/features/dramas/api";
import type { AdminUploadCapabilities, DramaRecord } from "@/shared/types";
import type { DramaEditorState } from "./useDramaEditorState";

export function useDramaEditorData(state: DramaEditorState) {
  function unavailableUploadCapabilities(reason: string): AdminUploadCapabilities {
    return {
      posterStorageReady: false,
      vodUploadReady: false,
      reasons: { posterStorage: reason, vodUpload: reason },
    };
  }

  function applyDrama(value: DramaRecord): void {
    state.drama.value = value;
    Object.assign(state.form, {
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
    state.form.category = normalizeDramaTypeCategory(state.form.category);
    state.dirty.value = false;
  }

  async function load(): Promise<void> {
    state.error.value = "";
    state.loading.value = !state.isNew.value;
    try {
      const uploadCapabilitiesPromise = typeof dramasApi.uploadCapabilities === "function"
        ? dramasApi.uploadCapabilities().catch((caught): AdminUploadCapabilities => unavailableUploadCapabilities(toErrorMessage(caught)))
        : Promise.resolve(unavailableUploadCapabilities("上传能力检查接口尚未接入"));
      const [gateResult, dramaResult, tagsResult, uploadCapabilitiesResult] = await Promise.all([
        dramasApi.releaseGate(),
        state.isNew.value ? Promise.resolve(null) : dramasApi.getDrama(state.id.value),
        dramasApi.listCatalogTags(),
        uploadCapabilitiesPromise,
      ]);
      state.gate.value = gateResult;
      state.uploadCapabilities.value = uploadCapabilitiesResult;
      state.tagLibrary.value = Array.isArray(tagsResult.items) ? tagsResult.items : [];
      if (dramaResult) applyDrama(dramaResult);
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.loading.value = false;
    }
  }

  async function refreshDrama(dramaId = state.id.value): Promise<void> {
    if (!dramaId) return;
    applyDrama(await dramasApi.getDrama(dramaId));
  }

  function activeTagIds(): Set<string> {
    return new Set(state.tagLibrary.value.filter((tag) => tag.status === CatalogTagStatus.ACTIVE).map((tag) => tag.id));
  }

  return { applyDrama, load, refreshDrama, activeTagIds };
}

export type DramaEditorData = ReturnType<typeof useDramaEditorData>;
