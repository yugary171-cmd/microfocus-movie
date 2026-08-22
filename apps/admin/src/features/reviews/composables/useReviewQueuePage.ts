import { ADMIN_WEB_PAGE_SIZE, isContentOperator } from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { reviewsApi } from "@/features/reviews/api";
import { reviewActionMessages } from "@/features/reviews/constants";
import { canReview } from "@/policies/admin";
import { useAuthStore } from "@/infrastructure/stores";
import type { ReviewItem } from "@/shared/types";

export function useReviewQueuePage() {
  const auth = useAuthStore();
  const items = ref<ReviewItem[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(ADMIN_WEB_PAGE_SIZE);
  const loading = ref(true);
  const error = ref("");
  const notice = ref("");
  const busy = ref(false);
  const selected = ref<ReviewItem | null>(null);
  const dialog = reactive<{ decision: "approve" | "reject" | null }>({ decision: null });
  const allowed = computed(() => Boolean(auth.user && isContentOperator(auth.user.role)));

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      let result = await reviewsApi.listReviews(page.value, pageSize.value);
      let nextItems = Array.isArray(result.items) ? result.items : [];
      let nextTotal = Number.isFinite(result.total) ? result.total : nextItems.length;
      const pages = Math.ceil(nextTotal / pageSize.value);
      if (nextItems.length === 0 && nextTotal > 0 && page.value > 1 && pages >= 1 && page.value > pages) {
        page.value = pages;
        result = await reviewsApi.listReviews(page.value, pageSize.value);
        nextItems = Array.isArray(result.items) ? result.items : [];
        nextTotal = Number.isFinite(result.total) ? result.total : nextItems.length;
      }
      items.value = nextItems;
      total.value = nextTotal;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  function go(next: number): void {
    page.value = next;
    void load();
  }

  function changePageSize(next: number): void {
    pageSize.value = next;
    page.value = 1;
    void load();
  }

  function openDecision(item: ReviewItem, decision: "approve" | "reject"): void {
    selected.value = item;
    dialog.decision = decision;
  }

  function closeDialog(): void {
    dialog.decision = null;
    selected.value = null;
  }

  async function confirmDecision(reason: string): Promise<void> {
    if (!selected.value || !dialog.decision) return;
    busy.value = true;
    error.value = "";
    try {
      await reviewsApi.review(
        selected.value.dramaId,
        selected.value.id,
        dialog.decision === "approve",
        reason,
      );
      notice.value = reviewsApi.mode === "mock"
        ? reviewActionMessages.mockCompleted
        : reviewActionMessages.completed;
      closeDialog();
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function reviewDecision(item: ReviewItem) {
    return auth.user ? canReview(auth.user, item) : { allowed: false, reason: "请先登录" };
  }

  onMounted(load);

  return {
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    notice,
    busy,
    selected,
    dialog,
    allowed,
    load,
    go,
    changePageSize,
    openDecision,
    closeDialog,
    confirmDecision,
    reviewDecision,
  };
}
