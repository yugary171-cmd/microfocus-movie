import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@microfocus/contracts";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
import { encryptTotpSecret, tryDecryptTotpSecret } from "./totp-crypto.js";
import { decodeTotpSecretBase32 } from "./totp-secret.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_ISSUER = "Microfocus Movie";

export type AdminTotpCredential = {
  totpEnabled: boolean;
  totpSecretEncrypted: string | null;
};

@Injectable()
export class TotpService {
  constructor(private readonly config: AppConfigService) {}

  verifyAdminOtp(admin: AdminTotpCredential, otp: string): boolean {
    if (this.config.env.NODE_ENV !== "production" && this.config.env.ADMIN_TEST_OTP) {
      return safeEqual(this.config.env.ADMIN_TEST_OTP, otp);
    }
    if (!admin.totpEnabled || !admin.totpSecretEncrypted) return false;
    const secret = this.decryptStoredSecret(admin.totpSecretEncrypted, true);
    return secret ? verifyTotp(secret, otp) : false;
  }

  createSetupSecret(email: string): {
    encryptedSecret: string;
    manualKey: string;
    otpauthUri: string;
  } {
    const manualKey = encodeBase32(randomBytes(20));
    const key = this.requireEncryptionKey();
    return {
      encryptedSecret: encryptTotpSecret(manualKey, key),
      manualKey,
      otpauthUri: buildOtpauthUri(email, manualKey)
    };
  }

  revealSetupSecret(email: string, encryptedSecret: string): {
    manualKey: string;
    otpauthUri: string;
  } {
    const manualKey = this.decryptStoredSecret(encryptedSecret, false);
    if (!manualKey) {
      throw Errors.unavailable(
        ERROR_CODES.ADMIN_SETUP_SECRET_UNAVAILABLE,
        "Administrator setup secret is unavailable"
      );
    }
    return { manualKey, otpauthUri: buildOtpauthUri(email, manualKey) };
  }

  verifySetupOtp(encryptedSecret: string, otp: string): boolean {
    const secret = this.decryptStoredSecret(encryptedSecret, false);
    return secret ? verifyTotp(secret, otp) : false;
  }

  private decryptStoredSecret(payload: string, allowDevelopmentPlaintext: boolean): string | null {
    if (payload.startsWith("plain:")) {
      if (!allowDevelopmentPlaintext || this.config.env.NODE_ENV === "production") return null;
      return payload.slice(6);
    }
    const key = this.requireEncryptionKey();
    const decrypted = tryDecryptTotpSecret(payload, {
      current: key,
      ...(this.config.env.TOTP_ENCRYPTION_KEY_PREVIOUS
        ? { previous: this.config.env.TOTP_ENCRYPTION_KEY_PREVIOUS }
        : {})
    });
    return decrypted?.secret ?? null;
  }

  private requireEncryptionKey(): string {
    const key = this.config.env.TOTP_ENCRYPTION_KEY;
    if (!key) throw Errors.providerNotConfigured("administrator TOTP encryption");
    return key;
  }
}

export function verifyTotp(base32Secret: string, token: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  let secret: Buffer;
  try {
    secret = decodeTotpSecretBase32(base32Secret);
  } catch {
    return false;
  }
  for (const offset of [-1, 0, 1]) {
    if (safeEqual(totpAt(secret, Math.floor(now / 30_000) + offset), token)) return true;
  }
  return false;
}

export function buildOtpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${email.trim().toLowerCase()}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&digits=6&period=30`;
}

export function currentTotp(secret: string, now = Date.now()): string {
  return totpAt(decodeTotpSecretBase32(secret), Math.floor(now / 30_000));
}

function totpAt(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buffer).digest();
  const position = (digest[digest.length - 1] ?? 0) & 0x0f;
  return ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

function encodeBase32(value: Buffer): string {
  let bits = "";
  for (const byte of value) bits += byte.toString(2).padStart(8, "0");
  let encoded = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    encoded += BASE32_ALPHABET[Number.parseInt(chunk, 2)] ?? "";
  }
  return encoded;
}

function safeEqual(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
