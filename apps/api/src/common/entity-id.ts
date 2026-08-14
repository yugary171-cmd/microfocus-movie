import { ENTITY_ID_MAX_LENGTH, ERROR_CODES } from "@microfocus/contracts";
import { Errors } from "./app-error.js";

export function requireEntityId(value: string | undefined, field = "id"): string {
  const id = value?.trim() ?? "";
  if (!id || id.length > ENTITY_ID_MAX_LENGTH) {
    throw Errors.badRequest(ERROR_CODES.INVALID_ENTITY_ID, `${field} is invalid`);
  }
  return id;
}

export function optionalEntityId(value: string | undefined, field = "id"): string | undefined {
  if (value == null || value.trim() === "") return undefined;
  return requireEntityId(value, field);
}
