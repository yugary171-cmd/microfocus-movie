import { CallbackEventStatus } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  listAdminCallbackEvents,
  resolveCallbackListStatuses,
  toAdminCallbackEventView
} from "./callback-list.js";

describe("admin callback event list", () => {
  it("defaults to backlog statuses and rejects unknown filters", () => {
    expect(resolveCallbackListStatuses()).toEqual([
      CallbackEventStatus.RECEIVED,
      CallbackEventStatus.PROCESSING,
      CallbackEventStatus.RETRYABLE_FAILURE,
      CallbackEventStatus.DEAD_LETTER
    ]);
    expect(resolveCallbackListStatuses("DEAD_LETTER")).toEqual([CallbackEventStatus.DEAD_LETTER]);
    expect(() => resolveCallbackListStatuses("OPEN")).toThrow(
      expect.objectContaining({ code: "INVALID_CALLBACK_STATUS" })
    );
  });

  it("marks payload availability without exposing ciphertext", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const view = toAdminCallbackEventView(
      {
        id: "event-1",
        provider: "VOD",
        eventType: "MEDIA_UPDATED",
        status: CallbackEventStatus.DEAD_LETTER,
        attempts: 5,
        receivedAt: new Date("2026-08-14T10:00:00.000Z"),
        processedAt: null,
        processingUntil: null,
        outcome: "RETRYABLE_FAILURE",
        payloadSchema: "vod.v1",
        payloadRetainUntil: new Date("2026-09-13T10:00:00.000Z"),
        payloadCiphertext: "should-not-leak"
      },
      now
    );
    expect(view).toMatchObject({
      eventId: "event-1",
      payloadAvailable: true,
      replayable: true
    });
    expect(JSON.stringify(view)).not.toContain("should-not-leak");
    expect(
      toAdminCallbackEventView(
        {
          id: "expired",
          provider: "VOD",
          eventType: "MEDIA_UPDATED",
          status: CallbackEventStatus.DEAD_LETTER,
          attempts: 5,
          receivedAt: now,
          processedAt: null,
          processingUntil: null,
          outcome: null,
          payloadSchema: "vod.v1",
          payloadRetainUntil: now
        },
        now
      ).payloadAvailable
    ).toBe(false);
  });

  it("queries selected columns only and filters by provider", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    await listAdminCallbackEvents(
      { callbackEvent: { count, findMany } },
      { status: "DEAD_LETTER", provider: "vod", take: 20, skip: 5 }
    );
    expect(count).toHaveBeenCalledWith({
      where: { status: { in: [CallbackEventStatus.DEAD_LETTER] }, provider: "VOD" }
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        skip: 5,
        select: expect.not.objectContaining({ payloadCiphertext: true })
      })
    );
  });
});
