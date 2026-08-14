export function parsePage(value = "1"): number {
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function boundedListWindow(input: {
  page?: number;
  pageSize: number;
  maxPage: number;
}): { page: number; pageSize: number; skip: number; take: number; exceeded: boolean } {
  const page = input.page && Number.isSafeInteger(input.page) && input.page > 0 ? input.page : 1;
  const exceeded = page > input.maxPage;
  return {
    page,
    pageSize: input.pageSize,
    skip: exceeded ? 0 : (page - 1) * input.pageSize,
    take: input.pageSize,
    exceeded
  };
}

export function emptyBoundedPage(page: number, pageSize: number): {
  items: [];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  return { items: [], page, pageSize, total: 0, totalPages: 0 };
}

export function maxListSkip(take: number, maxPage: number): number {
  return Math.max(0, (maxPage - 1) * Math.max(1, take));
}
