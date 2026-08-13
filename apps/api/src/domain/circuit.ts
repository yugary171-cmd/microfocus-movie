import type { PrismaClient, Prisma } from "@prisma/client";
import { Errors } from "../common/app-error.js";

type CircuitReader = Pick<PrismaClient, "circuitBreaker"> | Prisma.TransactionClient;

export async function assertCircuitsClosed(
  prisma: CircuitReader,
  input: { userId?: string; dramaId?: string; adUnitId?: string }
): Promise<void> {
  const keys = [
    "GLOBAL:GLOBAL",
    ...(input.userId ? [`USER:${input.userId}`] : []),
    ...(input.dramaId ? [`DRAMA:${input.dramaId}`] : []),
    ...(input.adUnitId ? [`AD_UNIT:${input.adUnitId}`] : [])
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
