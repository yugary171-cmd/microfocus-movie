import { describe, expect, it } from "vitest";
import { decryptEnvelope, encryptEnvelope } from "./envelope-crypto.js";

describe("envelope encryption", () => {
  it("round-trips plaintext without embedding it in the ciphertext", () => {
    const key = "callback-payload-key-that-is-32-chars";
    const encrypted = encryptEnvelope('{"eventId":"e1"}', key);
    expect(encrypted).not.toContain("eventId");
    expect(decryptEnvelope(encrypted, key)).toBe('{"eventId":"e1"}');
  });

  it("rejects a tampered ciphertext", () => {
    const key = "callback-payload-key-that-is-32-chars";
    const encrypted = encryptEnvelope("secret-payload", key);
    expect(() => decryptEnvelope(`${encrypted}x`, key)).toThrow();
  });
});
