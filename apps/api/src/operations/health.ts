import { ERROR_CODES } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import type { ProcessDrain } from "./process-drain.js";

export type HealthDatabase = {
  $queryRaw(query: TemplateStringsArray): Promise<unknown>;
};

export function liveHealth(): { status: "ok" } {
  return { status: "ok" };
}

export async function readyHealth(
  prisma: HealthDatabase,
  drain: Pick<ProcessDrain, "isDraining">
): Promise<{ status: "ok"; database: "ok" }> {
  if (drain.isDraining()) {
    throw Errors.unavailable(ERROR_CODES.NOT_READY, "Process is draining");
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw Errors.unavailable(ERROR_CODES.NOT_READY, "Database is not ready");
  }
  return { status: "ok", database: "ok" };
}
