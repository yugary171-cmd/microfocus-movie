import { describe, expect, it, vi } from "vitest";
import { assertCircuitsClosed, openProviderCircuit, providerCircuitKey } from "./circuit.js";

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

  it("rejects playback when the VOD provider breaker is open", async () => {
    const prisma = {
      circuitBreaker: {
        findFirst: vi.fn().mockResolvedValue({ provider: "PROVIDER:VOD", state: "OPEN" })
      }
    };
    await expect(
      assertCircuitsClosed(prisma as never, { userId: "user", providers: ["VOD"] })
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(prisma.circuitBreaker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: expect.objectContaining({ in: expect.arrayContaining(["PROVIDER:VOD"]) })
        })
      })
    );
  });

  it("opens a provider circuit once and does not use GLOBAL", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      circuitBreaker: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert
      }
    };
    await expect(
      openProviderCircuit(prisma as never, "VOD", "dead letter", "system:dead-letter")
    ).resolves.toBe("PROVIDER:VOD");
    expect(providerCircuitKey("wechat")).toBe("PROVIDER:WECHAT");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: "PROVIDER:VOD" },
        create: expect.objectContaining({
          state: "OPEN",
          provider: "PROVIDER:VOD",
          updatedBy: "system:dead-letter"
        })
      })
    );
  });

  it("leaves an already open provider circuit and its operator unchanged", async () => {
    const upsert = vi.fn();
    const prisma = {
      circuitBreaker: {
        findUnique: vi.fn().mockResolvedValue({
          provider: "PROVIDER:VOD",
          state: "OPEN",
          updatedBy: "system:dead-letter"
        }),
        upsert
      }
    };
    await expect(openProviderCircuit(prisma as never, "VOD", "another dead letter")).resolves.toBe(
      "PROVIDER:VOD"
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
