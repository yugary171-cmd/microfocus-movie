import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, tryDecryptTotpSecret } from "./totp-crypto.js";

describe("TOTP secret encryption", () => {
  const key = "local-test-key-that-is-at-least-thirty-two-characters";

  it("round trips without storing the plaintext", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("falls back to the previous encryption key during a rotation window", () => {
    const previous = "previous-totp-key-that-is-at-least-32-chars";
    const current = "current-totp-key-that-is-at-least-32-chars-x";
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", previous);
    expect(tryDecryptTotpSecret(encrypted, { current, previous })).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      keyUsed: "previous"
    });
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => decryptTotpSecret(`${encrypted}x`, key)).toThrow();
  });
});
