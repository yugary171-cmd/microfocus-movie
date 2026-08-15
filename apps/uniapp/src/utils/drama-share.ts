import type { DramaCard } from "@microfocus/contracts";

export type DramaShareCard = {
  title: string;
  path: string;
  imageUrl?: string;
};

export function buildDramaShareCard(input: {
  isMock: boolean;
  drama: Pick<DramaCard, "id" | "title" | "summary" | "coverUrl"> | null | undefined;
}): DramaShareCard | null {
  if (input.isMock) return null;
  const drama = input.drama;
  if (!drama?.id?.trim() || !drama.title?.trim()) return null;
  const path = `/pages/drama/index?id=${encodeURIComponent(drama.id)}`;
  const imageUrl = drama.coverUrl?.trim();
  return {
    title: drama.title.trim().slice(0, 32),
    path,
    ...(imageUrl ? { imageUrl } : {})
  };
}
