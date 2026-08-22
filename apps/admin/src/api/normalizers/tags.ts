import {
  CatalogTagStatus,
  isCatalogTagGroupId,
  type CatalogTag
} from "@microfocus/contracts";


import {
  record,
  text,
  finiteNumber,
  enumValue,
  collection
} from "./primitives";

export function normalizeCatalogTag(value: unknown): CatalogTag | null {
  const source = record(value);
  const group = text(source.group);
  const name = text(source.name).trim();
  const id = text(source.id);
  if (!id || !name || !isCatalogTagGroupId(group)) return null;
  return {
    id,
    group,
    name,
    status: enumValue(source.status, Object.values(CatalogTagStatus), CatalogTagStatus.ACTIVE),
    sortOrder: Math.max(0, Math.round(finiteNumber(source.sortOrder))),
    ...(typeof source.usageCount === "number"
      ? { usageCount: Math.max(0, Math.round(source.usageCount)) }
      : {}),
  };
}

export function normalizeCatalogTagList(value: unknown): CatalogTag[] {
  const items = collection(value)
    .map(normalizeCatalogTag)
    .filter((item): item is CatalogTag => item !== null);
  if (items.length) return items;
  const single = normalizeCatalogTag(value);
  return single ? [single] : [];
}
