import { ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";

export function requireBoundedEntityId(value: string, emptyMessage: string, label: string): string {
  const id = value.trim();
  if (!id) return emptyMessage;
  if (id.length > ENTITY_ID_MAX_LENGTH) return `${label}最长 ${ENTITY_ID_MAX_LENGTH} 个字符`;
  return "";
}
