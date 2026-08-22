import { ADMIN_WEB_PAGE_SIZE, AdminRole } from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { auditApi } from "@/features/audit/api";
import { usePaginatedList } from "@/shared/composables/usePaginatedList";
import { useAuthStore } from "@/infrastructure/stores";
import type { AuditLog } from "@/shared/types";

export function useAuditLogPage() {
  const auth = useAuthStore();
  const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
  const query = ref("");
  const list = usePaginatedList<AuditLog>({
    initialPageSize: ADMIN_WEB_PAGE_SIZE,
    loadPage: (currentPage, currentPageSize) => allowed.value
      ? auditApi.listAuditLogs(query.value, currentPage, currentPageSize)
      : Promise.resolve({ items: [], total: 0 }),
    getErrorMessage: toErrorMessage,
  });
  const { items, total, page, pageSize, loading, error } = list;

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    await list.load();
  }

  function filter(): void {
    list.resetPage();
    void load();
  }

  function go(next: number): void {
    list.go(next);
  }

  function changePageSize(next: number): void {
    list.changePageSize(next);
  }

  function contextDetail(item: AuditLog): string {
    const context = item.context;
    if (!context) return "";
    const parts = [
      context.dramaId ? `剧目 ${context.dramaId}` : "",
      context.episodeNumber !== undefined ? `第 ${context.episodeNumber} 集` : context.episodeId ? `集 ${context.episodeId}` : "",
      context.mediaVersion !== undefined ? `媒体 v${context.mediaVersion}` : "",
      context.uploadPhase ? `阶段 ${context.uploadPhase}` : "",
      context.fromStatus || context.toStatus ? `状态 ${context.fromStatus || "—"} → ${context.toStatus || "—"}` : "",
      context.reviewStatus ? `结论 ${context.reviewStatus}` : "",
      context.manualReviewStatus ? `人工 ${context.manualReviewStatus}` : "",
      context.wechatReviewStatus ? `微信 ${context.wechatReviewStatus}` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  }

  onMounted(load);

  return {
    allowed,
    query,
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    load,
    filter,
    go,
    changePageSize,
    contextDetail,
  };
}
