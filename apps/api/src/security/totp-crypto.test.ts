import { describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret } from "./totp-crypto.js";

describe("TOTP secret encryption", () => {
  const key = "local-test-key-that-is-at-least-thirty-two-characters";

  it("round trips without storing the plaintext", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptTotpSecret(encrypted, key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => decryptTotpSecret(`${encrypted}x`, key)).toThrow();
  });
});
