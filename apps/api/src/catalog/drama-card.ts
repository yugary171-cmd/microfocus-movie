import type { DramaCard } from "@microfocus/contracts";

export const catalogCardInclude = {
  _count: { select: { episodes: true } },
  rightsRecords: { where: { status: "ACTIVE" as const }, orderBy: { version: "desc" as const }, take: 1 }
};

export function toDramaCard(drama: {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  category: string;
  tagsJson: unknown;
  recommendationRank: number;
  rightsRecords: Array<{ licenseNumber: string }>;
  _count: { episodes: number };
}): DramaCard {
  return {
    id: drama.id,
    title: drama.title,
    summary: drama.summary,
    coverUrl: drama.coverUrl,
    category: drama.category,
    tags: Array.isArray(drama.tagsJson)
      ? drama.tagsJson.filter((tag): tag is string => typeof tag === "string")
      : [],
    episodeCount: drama._count.episodes,
    recommendationRank: drama.recommendationRank,
    licenseNumber: drama.rightsRecords[0]?.licenseNumber ?? ""
  };
}
