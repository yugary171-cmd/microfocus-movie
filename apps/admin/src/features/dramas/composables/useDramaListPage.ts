import {
  DRAMA_ADMIN_PAGE_SIZE,
  isContentOperator,
  normalizeAdminWebPageSize,
} from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { dramasApi } from "@/features/dramas/api";
import { usePaginatedList } from "@/shared/composables/usePaginatedList";
import { useAuthStore } from "@/infrastructure/stores";
import type { DramaRecord } from "@/shared/types";

export function useDramaListPage() {
  const auth = useAuthStore();
  const canCreateDrama = computed(() => Boolean(auth.user && isContentOperator(auth.user.role)));
  const query = ref("");
  const status = ref("");
  const list = usePaginatedList<DramaRecord>({
    initialPageSize: DRAMA_ADMIN_PAGE_SIZE,
    loadPage: (currentPage, currentPageSize) =>
      dramasApi.listDramas(query.value, status.value, currentPage, currentPageSize),
    normalizePageSize: normalizeAdminWebPageSize,
    getErrorMessage: toErrorMessage,
  });
  const { items, total, page, pageSize, loading, error } = list;
  const detailOpen = ref(false);
  const detailLoading = ref(false);
  const detailError = ref("");
  const selectedDrama = ref<DramaRecord | null>(null);
  let detailRequestId = 0;

  async function load(): Promise<void> {
    await list.load();
  }

  function filter(): void {
    list.resetPage();
    void load();
  }

  function reset(): void {
    query.value = "";
    status.value = "";
    list.resetPage();
    void load();
  }

  function go(next: number): void {
    list.go(next);
  }

  function changePageSize(value: number | string): void {
    list.changePageSize(Number(value));
  }

  async function openDetail(drama: DramaRecord): Promise<void> {
    const requestId = ++detailRequestId;
    selectedDrama.value = drama;
    detailOpen.value = true;
    detailLoading.value = true;
    detailError.value = "";
    try {
      const detail = await dramasApi.getDrama(drama.id);
      if (requestId === detailRequestId) selectedDrama.value = detail;
    } catch (caught) {
      if (requestId === detailRequestId) detailError.value = toErrorMessage(caught);
    } finally {
      if (requestId === detailRequestId) detailLoading.value = false;
    }
  }

  function closeDetail(): void {
    detailRequestId += 1;
    detailOpen.value = false;
    detailLoading.value = false;
    detailError.value = "";
    selectedDrama.value = null;
  }

  function retryDetail(): void {
    if (selectedDrama.value) void openDetail(selectedDrama.value);
  }

  onMounted(load);

  return {
    canCreateDrama,
    query,
    status,
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    detailOpen,
    detailLoading,
    detailError,
    selectedDrama,
    load,
    filter,
    reset,
    go,
    changePageSize,
    openDetail,
    closeDetail,
    retryDetail,
  };
}
