import type { DramaCard } from "@microfocus/contracts";
import { parseStoredTagIds } from "@microfocus/contracts";
import { catalogTagNameMap } from "./catalog-tags.js";

export const catalogCardInclude = {
  _count: { select: { episodes: true } },
  rightsRecords: { where: { status: "ACTIVE" as const }, orderBy: { version: "desc" as const }, take: 1 }
};

type DramaCardSource = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  category: string;
  tagsJson: unknown;
  recommendationRank: number;
  publishedAt?: Date | null;
  rightsRecords?: Array<{ licenseNumber: string }>;
  _count?: { episodes: number };
};

export function toDramaCard(drama: DramaCardSource, nameById: Map<string, string> = new Map()): DramaCard {
  return {
    id: drama.id,
    title: drama.title,
    summary: drama.summary,
    coverUrl: drama.coverUrl,
    category: drama.category,
    tags: parseStoredTagIds(drama.tagsJson)
      .map((id) => nameById.get(id))
      .filter((name): name is string => Boolean(name)),
    episodeCount: drama._count?.episodes ?? 0,
    recommendationRank: drama.recommendationRank,
    licenseNumber: drama.rightsRecords?.[0]?.licenseNumber ?? "",
    publishedAt: drama.publishedAt?.toISOString() ?? null
  };
}

export async function toDramaCards(
  prisma: Parameters<typeof catalogTagNameMap>[0],
  dramas: DramaCardSource[]
): Promise<DramaCard[]> {
  const nameById = await catalogTagNameMap(prisma, dramas);
  return dramas.map((drama) => toDramaCard(drama, nameById));
}
