const FORBIDDEN_SEARCH_SECTIONS = ["识剧", "话题榜", "热点话题榜", "短剧热搜榜"];

export function shuffleCopy<T>(items: readonly T[], seed: number): T[] {
  const copy = items.slice();
  let state = (Math.abs(Math.trunc(seed)) || 1) >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    const current = copy[index];
    const swapped = copy[swapIndex];
    if (current === undefined || swapped === undefined) continue;
    copy[index] = swapped;
    copy[swapIndex] = current;
  }
  return copy;
}

export function pickGuessQueries(pool: readonly string[], seed: number, count = 8): string[] {
  const unique = [...new Set(pool.map((item) => item.trim()).filter(Boolean))].filter(
    (item) => !FORBIDDEN_SEARCH_SECTIONS.some((blocked) => item.includes(blocked))
  );
  return shuffleCopy(unique, seed).slice(0, Math.max(0, count));
}

export function isForbiddenSearchSection(label: string): boolean {
  const value = label.trim();
  return FORBIDDEN_SEARCH_SECTIONS.some((blocked) => value === blocked || value.includes(blocked));
}
