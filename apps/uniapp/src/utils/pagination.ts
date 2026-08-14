export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number
): { items: T[]; page: number; hasMore: boolean } {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const list = Array.isArray(items) ? items : [];
  const start = (safePage - 1) * size;
  const slice = list.slice(start, start + size);
  return {
    items: slice,
    page: safePage,
    hasMore: start + slice.length < list.length
  };
}
