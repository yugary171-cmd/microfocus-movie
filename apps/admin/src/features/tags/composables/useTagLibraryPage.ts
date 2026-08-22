import {
  AdminRole,
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
  isCatalogTagGroupId,
  type CatalogTag,
  type CatalogTagGroupId,
} from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { tagsApi } from "@/features/tags/api";
import { tagActionMessages } from "@/features/tags/constants";
import { useAuthStore } from "@/infrastructure/stores";

export function useTagLibraryPage() {
  const auth = useAuthStore();
  const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
  const items = ref<CatalogTag[]>([]);
  const loading = ref(true);
  const busy = ref(false);
  const error = ref("");
  const notice = ref("");
  const createOpen = ref(false);
  const pending = ref<CatalogTag | null>(null);
  const inspecting = ref<CatalogTag | null>(null);
  const inspectAction = ref<"delete" | "archive">("archive");
  const replacementTagId = ref("");
  const form = reactive({
    group: "subjects" as CatalogTagGroupId,
    name: "",
  });

  const grouped = computed(() =>
    CATALOG_TAG_GROUPS.map((group) => {
      const tags = items.value.filter((tag) => tag.group === group.id);
      const activeCount = tags.filter((tag) => tag.status === CatalogTagStatus.ACTIVE).length;
      const archivedCount = tags.length - activeCount;
      return { ...group, tags, activeCount, archivedCount };
    }),
  );

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const result = await tagsApi.listCatalogTags(true);
      items.value = Array.isArray(result.items) ? result.items : [];
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  async function createTag(): Promise<void> {
    if (!isCatalogTagGroupId(form.group)) return;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      await tagsApi.createCatalogTag(form.group, form.name);
      form.name = "";
      createOpen.value = false;
      notice.value = tagActionMessages.created;
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  async function confirmStatus(): Promise<void> {
    const tag = pending.value;
    if (!tag) return;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      const next =
        tag.status === CatalogTagStatus.ACTIVE ? CatalogTagStatus.ARCHIVED : CatalogTagStatus.ACTIVE;
      await tagsApi.patchCatalogTag(tag.id, next);
      pending.value = null;
      notice.value = next === CatalogTagStatus.ARCHIVED
        ? tagActionMessages.archived
        : tagActionMessages.reactivated;
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  const inUse = computed(() => (inspecting.value?.usageCount ?? 0) > 0);
  const canArchive = computed(() => inspecting.value?.status === CatalogTagStatus.ACTIVE);
  const replacementOptions = computed(() => {
    const target = inspecting.value;
    if (!target) return [];
    return items.value.filter(
      (tag) =>
        tag.group === target.group &&
        tag.id !== target.id &&
        tag.status === CatalogTagStatus.ACTIVE,
    );
  });
  const inspectConfirmDisabled = computed(() => {
    if (busy.value || !inspecting.value) return true;
    if (inspectAction.value === "archive") return !canArchive.value;
    return inUse.value && !replacementTagId.value;
  });

  function chipLabel(tag: CatalogTag): string {
    return tag.status === CatalogTagStatus.ARCHIVED ? `启用「${tag.name}」` : tag.name;
  }

  async function inspectTag(tag: CatalogTag): Promise<void> {
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      const detail = await tagsApi.getCatalogTag(tag.id);
      inspecting.value = {
        ...detail,
        usageCount: Math.max(0, detail.usageCount ?? 0),
      };
      replacementTagId.value = "";
      inspectAction.value = detail.status === CatalogTagStatus.ACTIVE ? "archive" : "delete";
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function closeInspect(): void {
    inspecting.value = null;
    replacementTagId.value = "";
    inspectAction.value = "archive";
  }

  async function confirmInspect(): Promise<void> {
    const tag = inspecting.value;
    if (!tag || inspectConfirmDisabled.value) return;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      if (inspectAction.value === "archive") {
        await tagsApi.patchCatalogTag(tag.id, CatalogTagStatus.ARCHIVED);
        closeInspect();
        notice.value = tagActionMessages.archived;
      } else {
        const used = (tag.usageCount ?? 0) > 0;
        await tagsApi.deleteCatalogTag(tag.id, used ? replacementTagId.value : undefined);
        closeInspect();
        notice.value = used ? tagActionMessages.replacedAndDeleted : tagActionMessages.deleted;
      }
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  onMounted(load);

  return {
    allowed,
    loading,
    busy,
    error,
    notice,
    createOpen,
    pending,
    inspecting,
    inspectAction,
    replacementTagId,
    form,
    grouped,
    inUse,
    canArchive,
    replacementOptions,
    inspectConfirmDisabled,
    chipLabel,
    load,
    createTag,
    confirmStatus,
    inspectTag,
    closeInspect,
    confirmInspect,
  };
}
