import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

const PREFIX = "v1";

export function encryptTotpSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(encryptionKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptTotpSecret(payload: string, encryptionKey: string): string {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = payload.split(".");
  if (
    version !== PREFIX ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    throw new Error("Unsupported encrypted TOTP secret format");
  }
  const iv = Buffer.from(ivValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  const ciphertext = Buffer.from(ciphertextValue, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Malformed encrypted TOTP secret");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(encryptionKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function tryDecryptTotpSecret(
  payload: string,
  keys: { current: string; previous?: string }
): { secret: string; keyUsed: "current" | "previous" } | undefined {
  try {
    return { secret: decryptTotpSecret(payload, keys.current), keyUsed: "current" };
  } catch {
    if (!keys.previous) return undefined;
    try {
      return { secret: decryptTotpSecret(payload, keys.previous), keyUsed: "previous" };
    } catch {
      return undefined;
    }
  }
}

export function totpKeyFingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function deriveKey(value: string): Buffer {
  if (value.length < 32) throw new Error("TOTP encryption key is too short");
  return createHash("sha256").update(value, "utf8").digest();
}
