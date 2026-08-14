import { describe, expect, it, vi } from "vitest";
import {
  CALLBACK_PAYLOAD_PURGE_JOB,
  purgeExpiredCallbackPayloads,
  runCallbackPayloadPurgeJob
} from "./callback-payload-purge.js";

describe("callback payload retention purge", () => {
  it("clears ciphertext for expired envelopes and keeps the event row", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      callbackEvent: {
        findMany: vi.fn().mockResolvedValue([{ id: "event-1" }]),
        updateMany
      }
    };
    const now = new Date("2026-09-14T00:00:00.000Z");
    await expect(purgeExpiredCallbackPayloads(prisma, now)).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["event-1"] },
          payloadCiphertext: { not: null },
          payloadRetainUntil: { lte: now }
        }),
        data: {
          payloadCiphertext: null,
          payloadSchema: null,
          payloadRetainUntil: null
        }
      })
    );
  });

  it("does not scan events when the job lease is held", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      callbackEvent: {
        findMany: vi.fn(),
        updateMany: vi.fn()
      },
      operationalEvent: { create: vi.fn() }
    };
    await expect(runCallbackPayloadPurgeJob(prisma, { ownerId: "b" })).resolves.toEqual({
      acquired: false,
      purged: 0
    });
    expect(prisma.callbackEvent.findMany).not.toHaveBeenCalled();
  });

  it("records a count-only operational event and does not log ciphertext", async () => {
    const prisma = {
      backgroundJobLease: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      callbackEvent: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "event-1" }, { id: "event-2" }])
          .mockResolvedValueOnce([]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(runCallbackPayloadPurgeJob(prisma, { ownerId: "a" })).resolves.toEqual({
      acquired: true,
      purged: 2
    });
    expect(prisma.operationalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "CALLBACK_PAYLOAD_PURGED",
          value: 2
        })
      })
    );
    expect(JSON.stringify(prisma.operationalEvent.create.mock.calls)).not.toContain("payloadCiphertext");
    expect(prisma.backgroundJobLease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobName: CALLBACK_PAYLOAD_PURGE_JOB, ownerId: "a" }
      })
    );
  });
});
