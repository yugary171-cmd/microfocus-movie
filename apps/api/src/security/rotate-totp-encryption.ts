import {
  encryptTotpSecret,
  totpKeyFingerprint,
  tryDecryptTotpSecret
} from "./totp-crypto.js";
import { assertTotpSecretBase32 } from "./totp-secret.js";

export type TotpReencryptionRow = {
  id: string;
  totpSecretEncrypted: string | null;
};

export type TotpReencryptionPlan = {
  reencrypt: Array<{ id: string; nextCiphertext: string }>;
  alreadyCurrent: number;
  skipped: number;
  failures: number;
};

export function assertDistinctTotpKeys(currentKey: string, previousKey: string): void {
  if (currentKey.length < 32 || previousKey.length < 32) {
    throw new Error("TOTP encryption keys must be at least 32 characters");
  }
  if (currentKey === previousKey) {
    throw new Error("TOTP_ENCRYPTION_KEY and TOTP_ENCRYPTION_KEY_PREVIOUS must differ");
  }
}

export function planTotpReencryption(
  rows: TotpReencryptionRow[],
  fromKey: string,
  toKey: string
): TotpReencryptionPlan {
  assertDistinctTotpKeys(toKey, fromKey);
  const plan: TotpReencryptionPlan = {
    reencrypt: [],
    alreadyCurrent: 0,
    skipped: 0,
    failures: 0
  };
  for (const row of rows) {
    const payload = row.totpSecretEncrypted;
    if (!payload || payload.startsWith("plain:")) {
      plan.skipped += 1;
      continue;
    }
    const decrypted = tryDecryptTotpSecret(payload, { current: toKey, previous: fromKey });
    if (!decrypted) {
      plan.failures += 1;
      continue;
    }
    if (decrypted.keyUsed === "current") {
      plan.alreadyCurrent += 1;
      continue;
    }
    try {
      const secret = assertTotpSecretBase32(decrypted.secret);
      plan.reencrypt.push({
        id: row.id,
        nextCiphertext: encryptTotpSecret(secret, toKey)
      });
    } catch {
      plan.failures += 1;
    }
  }
  return plan;
}

export function totpRotationSummary(input: {
  mode: "dry-run" | "apply" | "rollback";
  plan: TotpReencryptionPlan;
  currentKey: string;
  previousKey: string;
}): Record<string, string | number> {
  return {
    mode: input.mode,
    currentKeyFingerprint: totpKeyFingerprint(input.currentKey),
    previousKeyFingerprint: totpKeyFingerprint(input.previousKey),
    reencrypt: input.plan.reencrypt.length,
    alreadyCurrent: input.plan.alreadyCurrent,
    skipped: input.plan.skipped,
    failures: input.plan.failures
  };
}
