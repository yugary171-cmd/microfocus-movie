import { CALLBACK_MAX_ATTEMPTS, CallbackEventStatus } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  claimCallbackEvent,
  releaseCallbackEvent
} from "./callbacks.module.js";

function callbackStore(input: {
  createRejects?: boolean;
  processedAt?: Date | null;
  processingUntil?: Date | null;
  status?: string;
  attempts?: number;
  updateCount?: number;
}) {
  return {
    callbackEvent: {
      create: input.createRejects
        ? vi.fn().mockRejectedValue({ code: "P2002" })
        : vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({
        processedAt: input.processedAt ?? null,
        processingUntil: input.processingUntil ?? null,
        status: input.status ?? CallbackEventStatus.PROCESSING,
        attempts: input.attempts ?? 1,
        provider: "VOD",
        eventType: "MEDIA_UPDATED"
      }),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 0 }),
      update: vi.fn().mockResolvedValue({})
    },
    operationalEvent: {
      create: vi.fn().mockResolvedValue({})
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
    const store = callbackStore({
      createRejects: true,
      processingUntil: null,
      status: CallbackEventStatus.RETRYABLE_FAILURE,
      updateCount: 1
    });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("claimed");
  });

  it("treats only processed callbacks as duplicates", async () => {
    const store = callbackStore({
      createRejects: true,
      processedAt: new Date(),
      processingUntil: null,
      status: CallbackEventStatus.PROCESSED
    });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("processed");
  });

  it("does not reclaim dead-letter events until an admin replay", async () => {
    const store = callbackStore({
      createRejects: true,
      processingUntil: null,
      status: CallbackEventStatus.DEAD_LETTER,
      attempts: CALLBACK_MAX_ATTEMPTS,
      updateCount: 1
    });
    await expect(
      claimCallbackEvent(store, "event", "VOD", "MEDIA_UPDATED")
    ).resolves.toBe("dead_letter");
    expect(store.callbackEvent.updateMany).not.toHaveBeenCalled();
  });
});

describe("callback release", () => {
  it("marks exhausted retries as dead letter", async () => {
    const store = callbackStore({ attempts: CALLBACK_MAX_ATTEMPTS });
    await releaseCallbackEvent(store, "event", "RETRYABLE_FAILURE");
    expect(store.callbackEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CallbackEventStatus.DEAD_LETTER,
          processingUntil: null
        })
      })
    );
    expect(store.operationalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "CALLBACK_DEAD_LETTER",
          entityId: "event"
        })
      })
    );
  });

  it("keeps retryable failures below the attempt ceiling", async () => {
    const store = callbackStore({ attempts: CALLBACK_MAX_ATTEMPTS - 1 });
    await releaseCallbackEvent(store, "event", "RETRYABLE_FAILURE");
    expect(store.callbackEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CallbackEventStatus.RETRYABLE_FAILURE
        })
      })
    );
    expect(store.operationalEvent.create).not.toHaveBeenCalled();
  });
});
