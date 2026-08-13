import { describe, expect, it, vi } from "vitest";
import { claimCallbackEvent } from "./callbacks.module.js";

function callbackStore(input: {
  createRejects?: boolean;
  processedAt?: Date | null;
  processingUntil?: Date | null;
  updateCount?: number;
}) {
  return {
    callbackEvent: {
      create: input.createRejects
        ? vi.fn().mockRejectedValue({ code: "P2002" })
        : vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({
        processedAt: input.processedAt ?? null,
        processingUntil: input.processingUntil ?? null
      }),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 0 }),
      update: vi.fn().mockResolvedValue({})
    }
  };
}

describe("callback claim lease", () => {
  it("lets only one concurrent worker own an active callback", async () => {
    const store = callbackStore({ createRejects: true, updateCount: 0 });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("busy");
  });

  it("reclaims a callback whose failed worker released its lease", async () => {
    const store = callbackStore({ createRejects: true, processingUntil: null, updateCount: 1 });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("claimed");
  });

  it("treats only processed callbacks as duplicates", async () => {
    const store = callbackStore({
      createRejects: true,
      processedAt: new Date(),
      processingUntil: null
    });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("processed");
  });
});
