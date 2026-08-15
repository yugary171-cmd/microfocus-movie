import type { PrismaClient, Prisma } from "@prisma/client";
import {
  boundCircuitUpdatedBy,
  CIRCUIT_PROVIDER_NAME_MAX_LENGTH
} from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";

type CircuitReader = Pick<PrismaClient, "circuitBreaker"> | Prisma.TransactionClient;

export function providerCircuitKey(provider: string): string {
  const normalized = provider
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, CIRCUIT_PROVIDER_NAME_MAX_LENGTH);
  return `PROVIDER:${normalized || "UNKNOWN"}`;
}

export async function assertCircuitsClosed(
  prisma: CircuitReader,
  input: {
    userId?: string;
    dramaId?: string;
    adUnitId?: string;
    providers?: string[];
  }
): Promise<void> {
  const keys = [
    "GLOBAL:GLOBAL",
    ...(input.userId ? [`USER:${input.userId}`] : []),
    ...(input.dramaId ? [`DRAMA:${input.dramaId}`] : []),
    ...(input.adUnitId ? [`AD_UNIT:${input.adUnitId}`] : []),
    ...(input.providers ?? []).map((provider) => providerCircuitKey(provider))
  ];
  const open = await prisma.circuitBreaker.findFirst({
    where: { provider: { in: keys }, state: "OPEN" }
  });
  if (open) {
    throw Errors.forbidden(
      "CIRCUIT_OPEN",
      "This operation is temporarily suspended by an operational safety control"
    );
  }
}

export async function openProviderCircuit(
  prisma: CircuitReader,
  provider: string,
  reason: string,
  updatedBy = "system"
): Promise<string> {
  const key = providerCircuitKey(provider);
  const existing = await prisma.circuitBreaker.findUnique({ where: { provider: key } });
  if (existing?.state === "OPEN") return key;
  const actor = boundCircuitUpdatedBy(updatedBy) || "system";
  await prisma.circuitBreaker.upsert({
    where: { provider: key },
    create: {
      provider: key,
      state: "OPEN",
      reason,
      openedAt: new Date(),
      updatedBy: actor
    },
    update: {
      state: "OPEN",
      reason,
      openedAt: new Date(),
      updatedBy: actor
    }
  });
  return key;
}
