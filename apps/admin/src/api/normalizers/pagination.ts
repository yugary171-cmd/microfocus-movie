


import {
  record,
  finiteNumber
} from "./primitives";

export function pageTotal(value: unknown, itemsLength: number): number {
  const source = record(value);
  if (!("total" in source)) return itemsLength;
  const total = Math.round(finiteNumber(source.total));
  return total >= 0 ? total : itemsLength;
}
