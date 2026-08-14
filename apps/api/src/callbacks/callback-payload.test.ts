import { CALLBACK_PAYLOAD_RETENTION_SECONDS } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import {
  buildStoredEnvelope,
  CALLBACK_PAYLOAD_VOD_V1,
  readStoredPayload
} from "./callback-payload.js";

const key = "callback-payload-key-that-is-32-chars";
const body = {
  eventId: "event-1",
  fileId: "file-1",
  mediaStatus: "READY" as const,
  transcodeStatus: "READY" as const,
  machineReviewStatus: "APPROVED" as const
};

describe("callback payload envelope", () => {
  it("stores an encrypted canonical payload and a raw-body hash", () => {
    const envelope = buildStoredEnvelope({
      encryptionKey: key,
      rawBody: Buffer.from('{"eventId":"event-1"}'),
      schema: CALLBACK_PAYLOAD_VOD_V1,
      body
    });
    expect(envelope.payloadHash).toHaveLength(64);
    expect(envelope.payloadCiphertext).not.toContain("file-1");
    expect(envelope.payloadSchema).toBe(CALLBACK_PAYLOAD_VOD_V1);
    const stored = readStoredPayload(
      {
        payloadCiphertext: envelope.payloadCiphertext ?? null,
        payloadSchema: envelope.payloadSchema ?? null,
        payloadRetainUntil: envelope.payloadRetainUntil ?? null
      },
      key
    );
    expect(stored).toEqual({ schema: CALLBACK_PAYLOAD_VOD_V1, body });
  });

  it("does not decrypt after the retention window", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");
    const envelope = buildStoredEnvelope({
      encryptionKey: key,
      schema: CALLBACK_PAYLOAD_VOD_V1,
      body,
      now
    });
    const stored = readStoredPayload(
      {
        payloadCiphertext: envelope.payloadCiphertext ?? null,
        payloadSchema: envelope.payloadSchema ?? null,
        payloadRetainUntil: envelope.payloadRetainUntil ?? null
      },
      key,
      new Date(now.getTime() + (CALLBACK_PAYLOAD_RETENTION_SECONDS + 1) * 1000)
    );
    expect(stored).toBeUndefined();
  });

  it("omits ciphertext when no encryption key is configured", () => {
    const envelope = buildStoredEnvelope({
      schema: CALLBACK_PAYLOAD_VOD_V1,
      body
    });
    expect(envelope.payloadCiphertext).toBeUndefined();
  });
});
