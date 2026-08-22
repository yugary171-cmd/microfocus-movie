import {
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
  DRAMA_TYPE_OPTIONS,
  isOwnedContentRole,
  isSuperAdmin,
  type CatalogTag,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import { computed, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/infrastructure/stores";
import type { AdminUploadCapabilities, DramaInput, DramaRecord, EpisodeRecord } from "@/shared/types";

export function useDramaEditorState() {
  const route = useRoute();
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

  const canEdit = computed(() => {
    if (!auth.user) return false;
    if (isSuperAdmin(auth.user.role)) return true;
    return isOwnedContentRole(auth.user.role) && (isNew.value || drama.value?.ownerId === auth.user.id);
  });
  const readonlyReason = computed(() => canEdit.value ? "" : "只能编辑本人负责的剧目。");
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
    tagLibrary,
    tagGroups,
    selectedDramaType,
    rightsFilled,
    localPosterUrls,
    posterUploadIds,
    posterUploadProgress,
    uploadCapabilities,
    canEdit,
    readonlyReason,
    selectedTagChips,
    applySelectedTags,
    inputChanged,
    updateEpisodes,
  };
}

export type DramaEditorState = ReturnType<typeof useDramaEditorState>;
