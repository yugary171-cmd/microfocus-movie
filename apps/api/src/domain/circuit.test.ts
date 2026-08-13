import { describe, expect, it, vi } from "vitest";
import { assertCircuitsClosed } from "./circuit.js";

describe("operational circuit enforcement", () => {
  it("rejects playback when the global breaker is open", async () => {
    const prisma = {
      circuitBreaker: {
        findFirst: vi.fn().mockResolvedValue({ provider: "GLOBAL:GLOBAL", state: "OPEN" })
      }
    };
    await expect(assertCircuitsClosed(prisma as never, { userId: "user" })).rejects.toMatchObject({
      code: "CIRCUIT_OPEN"
    });
  });
});
