
export type UnknownRecord = Record<string, unknown>;

export function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function dateText(value: unknown): string {
  const candidate = text(value);
  return candidate && !Number.isNaN(new Date(candidate).getTime()) ? candidate : "";
}

export function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? (value as T) : fallback;
}

export function latestRecord(value: unknown): UnknownRecord {
  return record(array(value)[0]);
}

export function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return array(record(value).items);
}

