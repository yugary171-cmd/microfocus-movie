import {
  isOwnedContentRole,
  isSuperAdmin,
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
  DRAMA_TYPE_OPTIONS,
  normalizeDramaTypeCategory,
  type CatalogTag,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { toErrorMessage } from "@/infrastructure/api";
import { dramasApi } from "@/features/dramas/api";
import { dramaActionMessages } from "@/features/dramas/constants";
import { dramaDraftError, posterFileError } from "@/policies/drama-input";
import { useAuthStore } from "@/infrastructure/stores";
import type { AdminUploadCapabilities, DramaInput, DramaRecord, EpisodeRecord } from "@/shared/types";

export function useDramaEditorPage() {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const id = computed(() => typeof route.params.id === "string" ? route.params.id : "");
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
  const tagGroups = computed(() => CATALOG_TAG_GROUPS.map((group) => ({
    ...group,
    options: tagLibrary.value
      .filter((tag) => tag.group === group.id && tag.status === CatalogTagStatus.ACTIVE)
      .map((tag) => ({ id: tag.id, name: tag.name })),
  })));
  const selectedDramaType = computed(() => DRAMA_TYPE_OPTIONS.find((option) => option.category === form.category) ?? null);
  const rightsFilled = computed(() => Boolean(form.licenseNumber.trim() && form.rightsHolder.trim()));
  const localPosterUrls = reactive({ cover: "", promo: "" });
  const posterUploadIds = reactive({ cover: "", promo: "" });
  const posterUploadProgress = reactive({ cover: 0, promo: 0 });
  const uploadCapabilities = ref<AdminUploadCapabilities>({
    posterStorageReady: false,
    vodUploadReady: false,
    reasons: { posterStorage: "上传能力尚未加载", vodUpload: "上传能力尚未加载" },
  });

  const unavailableUploadCapabilities = (reason: string): AdminUploadCapabilities => ({
    posterStorageReady: false,
    vodUploadReady: false,
    reasons: { posterStorage: reason, vodUpload: reason },
  });
  const canEdit = computed(() => {
    if (!auth.user) return false;
    if (isSuperAdmin(auth.user.role)) return true;
    return isOwnedContentRole(auth.user.role) && (isNew.value || drama.value?.ownerId === auth.user.id);
  });
  const readonlyReason = computed(() => canEdit.value ? "" : "只能编辑本人负责的剧目。");

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
    form.category = normalizeDramaTypeCategory(form.category);
    dirty.value = false;
  }

  function revokeLocalUrl(kind: "cover" | "promo"): void {
    const current = localPosterUrls[kind];
    if (current) URL.revokeObjectURL(current);
    localPosterUrls[kind] = "";
  }

  async function choosePoster(kind: "cover" | "promo", event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !canEdit.value) return;
    const validation = posterFileError(file);
    if (validation) {
      error.value = validation;
      return;
    }
    if (dramasApi.mode === "live") {
      if (!uploadCapabilities.value.posterStorageReady) {
        error.value = uploadCapabilities.value.reasons.posterStorage || "海报对象存储尚未配置";
        return;
      }
      posterUploadProgress[kind] = 1;
      error.value = "";
      try {
        const uploaded = await dramasApi.uploadPoster(id.value, kind, file, (progress) => {
          posterUploadProgress[kind] = progress;
        });
        revokeLocalUrl(kind);
        posterUploadIds[kind] = uploaded.uploadId;
        if (kind === "cover") form.coverUrl = uploaded.assetUrl;
        else form.promoCoverUrl = uploaded.assetUrl;
        inputChanged();
        notice.value = kind === "cover" ? dramaActionMessages.coverUploaded : dramaActionMessages.promoCoverUploaded;
      } catch (caught) {
        error.value = toErrorMessage(caught);
      } finally {
        posterUploadProgress[kind] = 0;
      }
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
    posterUploadIds[kind] = "";
    inputChanged();
  }

  const selectedTagChips = computed(() => form.tagIds.map((tagId) => ({
    id: tagId,
    name: tagLibrary.value.find((tag) => tag.id === tagId)?.name ?? "未知标签",
  })));

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
      const uploadCapabilitiesPromise = typeof dramasApi.uploadCapabilities === "function"
        ? dramasApi.uploadCapabilities().catch((caught): AdminUploadCapabilities => unavailableUploadCapabilities(toErrorMessage(caught)))
        : Promise.resolve(unavailableUploadCapabilities("上传能力检查接口尚未接入"));
      const [gateResult, dramaResult, tagsResult, uploadCapabilitiesResult] = await Promise.all([
        dramasApi.releaseGate(),
        isNew.value ? Promise.resolve(null) : dramasApi.getDrama(id.value),
        dramasApi.listCatalogTags(),
        uploadCapabilitiesPromise,
      ]);
      gate.value = gateResult;
      uploadCapabilities.value = uploadCapabilitiesResult;
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
      const posterUploads = {
        ...(posterUploadIds.cover ? { coverUploadId: posterUploadIds.cover } : {}),
        ...(posterUploadIds.promo ? { promoUploadId: posterUploadIds.promo } : {}),
      };
      const saved = Object.keys(posterUploads).length > 0
        ? await dramasApi.saveDrama(payload, id.value || undefined, posterUploads)
        : await dramasApi.saveDrama(payload, id.value || undefined);
      applyDrama(saved);
      notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockSaved : dramaActionMessages.saved;
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
      await dramasApi.submitReview(target.id);
      await refreshDrama(target.id);
      notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockReviewSubmitted : dramaActionMessages.reviewSubmitted;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      actionBusy.value = false;
    }
  }

  async function refreshDrama(dramaId = id.value): Promise<void> {
    if (!dramaId) return;
    applyDrama(await dramasApi.getDrama(dramaId));
  }

  async function confirmAction(reason: string): Promise<void> {
    if (!drama.value || !dialog.type) return;
    actionBusy.value = true;
    error.value = "";
    try {
      if (dialog.type === "publish") {
        await dramasApi.publish(drama.value.id);
        notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockPublished : dramaActionMessages.published;
      } else {
        await dramasApi.offline(drama.value.id, reason);
        notice.value = dramasApi.mode === "mock" ? dramaActionMessages.mockOffline : dramaActionMessages.offline;
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

  return {
    auth,
    id,
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
  };
}
