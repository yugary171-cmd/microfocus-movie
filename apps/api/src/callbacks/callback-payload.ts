import { CALLBACK_PAYLOAD_RETENTION_SECONDS } from "@microfocus/contracts";
import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import { decryptEnvelope, encryptEnvelope } from "../security/envelope-crypto.js";

export const CALLBACK_PAYLOAD_VOD_V1 = "vod.v1";
export const CALLBACK_PAYLOAD_REWARD_V1 = "reward.v1";

export type VodCallbackBody = {
  eventId: string;
  fileId: string;
  mediaStatus: "READY" | "FAILED";
  transcodeStatus: "READY" | "FAILED";
  machineReviewStatus: "APPROVED" | "REJECTED";
};

export type RewardCallbackBody = {
  eventId: string;
  challengeId: string;
  completedAt?: string;
};

export type StoredCallbackEnvelope = {
  payloadHash?: string;
  payloadCiphertext?: string;
  payloadSchema?: string;
  payloadRetainUntil?: Date;
};

export function resolvePayloadEncryptionKey(env: Pick<AppEnv, "CALLBACK_PAYLOAD_ENCRYPTION_KEY" | "TOTP_ENCRYPTION_KEY">): string | undefined {
  return env.CALLBACK_PAYLOAD_ENCRYPTION_KEY ?? env.TOTP_ENCRYPTION_KEY;
}

export function withEncryptionKey(
  encryptionKey: string | undefined
): { encryptionKey: string } | Record<string, never> {
  return encryptionKey ? { encryptionKey } : {};
}

export function hashRawCallbackBody(rawBody: Buffer | undefined): string | undefined {
  if (!rawBody?.length) return undefined;
  return createHash("sha256").update(rawBody).digest("hex");
}

export function buildStoredEnvelope(input: {
  encryptionKey?: string;
  rawBody?: Buffer;
  schema: typeof CALLBACK_PAYLOAD_VOD_V1 | typeof CALLBACK_PAYLOAD_REWARD_V1;
  body: VodCallbackBody | RewardCallbackBody;
  now?: Date;
}): StoredCallbackEnvelope {
  const payloadHash = hashRawCallbackBody(input.rawBody);
  if (!input.encryptionKey) return { ...(payloadHash ? { payloadHash } : {}) };
  const plaintext = JSON.stringify(input.body);
  return {
    ...(payloadHash ? { payloadHash } : {}),
    payloadCiphertext: encryptEnvelope(plaintext, input.encryptionKey),
    payloadSchema: input.schema,
    payloadRetainUntil: new Date(
      (input.now ?? new Date()).getTime() + CALLBACK_PAYLOAD_RETENTION_SECONDS * 1000
    )
  };
}

export function readStoredPayload(
  event: {
    payloadCiphertext: string | null;
    payloadSchema: string | null;
    payloadRetainUntil: Date | null;
  },
  encryptionKey: string | undefined,
  now = new Date()
): { schema: string; body: VodCallbackBody | RewardCallbackBody } | undefined {
  if (!event.payloadCiphertext || !event.payloadSchema) return undefined;
  if (event.payloadRetainUntil && event.payloadRetainUntil.getTime() <= now.getTime()) {
    return undefined;
  }
  if (!encryptionKey) return undefined;
  const parsed = JSON.parse(decryptEnvelope(event.payloadCiphertext, encryptionKey)) as unknown;
  if (!parsed || typeof parsed !== "object") return undefined;
  return { schema: event.payloadSchema, body: parsed as VodCallbackBody | RewardCallbackBody };
}
