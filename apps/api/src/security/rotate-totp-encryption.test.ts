import { describe, expect, it } from "vitest";
import { encryptTotpSecret, tryDecryptTotpSecret } from "./totp-crypto.js";
import { planTotpReencryption } from "./rotate-totp-encryption.js";

const previous = "previous-totp-key-that-is-at-least-32-chars";
const current = "current-totp-key-that-is-at-least-32-chars-x";
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP encryption key rotation", () => {
  it("re-encrypts secrets that only the previous key can open", () => {
    const oldCipher = encryptTotpSecret(secret, previous);
    const plan = planTotpReencryption(
      [
        { id: "admin-1", totpSecretEncrypted: oldCipher },
        { id: "admin-2", totpSecretEncrypted: encryptTotpSecret(secret, current) },
        { id: "admin-3", totpSecretEncrypted: "plain:dev" },
        { id: "admin-4", totpSecretEncrypted: null }
      ],
      previous,
      current
    );
    expect(plan.reencrypt).toHaveLength(1);
    expect(plan.reencrypt[0]?.id).toBe("admin-1");
    expect(plan.alreadyCurrent).toBe(1);
    expect(plan.skipped).toBe(2);
    expect(plan.failures).toBe(0);
    expect(tryDecryptTotpSecret(plan.reencrypt[0]?.nextCiphertext ?? "", { current })?.secret).toBe(
      secret
    );
    expect(plan.reencrypt[0]?.nextCiphertext).not.toContain(secret);
  });

  it("counts undecryptable ciphertext as a failure and does not invent plaintext", () => {
    const plan = planTotpReencryption(
      [{ id: "admin-1", totpSecretEncrypted: "v1.not-a-real-envelope" }],
      previous,
      current
    );
    expect(plan.failures).toBe(1);
    expect(plan.reencrypt).toHaveLength(0);
  });

  it("rejects identical keys", () => {
    expect(() => planTotpReencryption([], current, current)).toThrow(/must differ/);
  });
});
