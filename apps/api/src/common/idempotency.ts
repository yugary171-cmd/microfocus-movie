import { IDEMPOTENCY_KEY_MAX_LENGTH } from "@microfocus/contracts";
import { Errors } from "./app-error.js";

export function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw Errors.badRequest(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required"
    );
  }
  return key;
}
