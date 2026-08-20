import {
  CatalogTagStatus,
  parseStoredTagIds,
  replaceStoredTagId,
  type CatalogTag,
  type CatalogTagGroupId
} from "@microfocus/contracts";

export function toCatalogTag(row: {
  id: string;
  group: string;
  name: string;
  status: string;
  sortOrder: number;
  usageCount?: number;
}): CatalogTag {
  return {
    id: row.id,
    group: row.group as CatalogTagGroupId,
    name: row.name,
    status: row.status === CatalogTagStatus.ARCHIVED ? CatalogTagStatus.ARCHIVED : CatalogTagStatus.ACTIVE,
    sortOrder: row.sortOrder,
    ...(typeof row.usageCount === "number" ? { usageCount: Math.max(0, row.usageCount) } : {})
  };
}

export function tagIdsFromJson(value: unknown): string[] {
  return parseStoredTagIds(value);
}

export async function catalogTagNameMap(
  prisma: { catalogTag: { findMany: (args: object) => Promise<Array<{ id: string; name: string }>> } },
  dramas: Array<{ tagsJson: unknown }>
): Promise<Map<string, string>> {
  const ids = [...new Set(dramas.flatMap((drama) => tagIdsFromJson(drama.tagsJson)))];
  if (!ids.length) return new Map();
  const rows = await prisma.catalogTag.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true }
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function resolvedTagNames(tagsJson: unknown, nameById: Map<string, string>): string[] {
  return tagIdsFromJson(tagsJson)
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));
}

export function rewriteDramaTagIds(tagsJson: unknown, fromId: string, toId: string): string[] {
  return replaceStoredTagId(tagIdsFromJson(tagsJson), fromId, toId);
}
