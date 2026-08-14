const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MIN_TOTP_SECRET_CHARS = 16;

export function normalizeTotpSecret(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, "").replace(/=+$/g, "");
}

export function assertTotpSecretBase32(value: string | undefined): string {
  const secret = normalizeTotpSecret(value ?? "");
  if (secret.length < MIN_TOTP_SECRET_CHARS) {
    throw new Error("TOTP secret must be a Base32 string of at least 16 characters");
  }
  for (const character of secret) {
    if (!BASE32_ALPHABET.includes(character)) {
      throw new Error("TOTP secret is not valid Base32");
    }
  }
  decodeTotpSecretBase32(secret);
  return secret;
}

export function decodeTotpSecretBase32(value: string): Buffer {
  const secret = normalizeTotpSecret(value);
  let bits = "";
  for (const character of secret) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("TOTP secret is not valid Base32");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  if (bytes.length < 10) {
    throw new Error("TOTP secret must decode to at least 80 bits");
  }
  return Buffer.from(bytes);
}

export function isExampleTotpSecret(value: string): boolean {
  const secret = normalizeTotpSecret(value);
  return /replace|example|change.?me/i.test(value) || secret === "JBSWY3DPEHPK3PXP";
}
