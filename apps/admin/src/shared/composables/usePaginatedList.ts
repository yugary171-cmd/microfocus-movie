import { computed, ref } from "vue";

export interface PaginatedPage<T> {
  items: T[];
  total: number;
}

export interface UsePaginatedListOptions<T> {
  initialPageSize: number;
  loadPage: (page: number, pageSize: number) => Promise<PaginatedPage<T>>;
  normalizePageSize?: (value: number) => number;
  getErrorMessage?: (error: unknown) => string;
}

/**
 * Shared pagination state for list pages. Query/filter state intentionally
 * stays in the feature so each page keeps its own request contract.
 */
export function usePaginatedList<T>(options: UsePaginatedListOptions<T>) {
  const items = ref<T[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(options.initialPageSize);
  const loading = ref(true);
  const error = ref("");
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      const result = await options.loadPage(page.value, pageSize.value);
      items.value = Array.isArray(result.items) ? result.items : [];
      total.value = Number.isFinite(result.total) ? result.total : items.value.length;
    } catch (caught) {
      error.value = options.getErrorMessage?.(caught) ?? "请求失败，请稍后重试";
    } finally {
      loading.value = false;
    }
  }

  function go(nextPage: number): void {
    page.value = Math.max(1, nextPage);
    void load();
  }

  function changePageSize(value: number): void {
    pageSize.value = options.normalizePageSize?.(value) ?? value;
    page.value = 1;
    void load();
  }

  function resetPage(): void {
    page.value = 1;
  }

  return { items, total, page, pageSize, pageCount, loading, error, load, go, changePageSize, resetPage };
}
