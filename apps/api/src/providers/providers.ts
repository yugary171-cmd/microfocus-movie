import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  PLAYBACK_TOKEN_TTL_SECONDS,
  POSTER_UPLOAD_TTL_SECONDS,
  PROVIDER_SIGNATURE_MAX_LENGTH,
  type VodUploadAuthorization
} from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
export { CosProviderService } from "./cos.js";
export type {
  CosObjectMetadata,
  PosterUploadAuthorizationInput
} from "./cos.js";

export interface WechatProvider {
  exchangeCode(code: string): Promise<{ openId: string }>;
  verifyReward(input: { challengeId: string; eventId: string }): Promise<boolean>;
}

export interface VodProvider {
  createPlaybackUrl(mediaId: string, ttlSeconds: number): Promise<string>;
  createUploadAuthorization(input: VodUploadAuthorizationInput): Promise<VodUploadAuthorization>;
}

export interface VodUploadAuthorizationInput {
  filename: string;
  size: number;
  contentType: string;
  dramaId: string;
  episodeId: string;
  uploadId?: string;
}

// Login exchange is implemented, but rewarded-ad SSV and VOD signing remain
// fail-closed. External traffic must stay blocked until both are implemented
// and verified end-to-end with real accounts.
export const LIVE_PROVIDER_IMPLEMENTATIONS_READY = false;

@Injectable()
export class WechatProviderService implements WechatProvider {
  constructor(private readonly config: AppConfigService) {}

  async exchangeCode(code: string): Promise<{ openId: string }> {
    if (this.config.env.WECHAT_MODE === "mock") {
      return { openId: `mock:${stableIdentifier(code)}` };
    }
    if (!this.config.env.WECHAT_APP_ID || !this.config.env.WECHAT_APP_SECRET) {
      throw Errors.providerNotConfigured("WeChat");
    }
    const endpoint = new URL("https://api.weixin.qq.com/sns/jscode2session");
    endpoint.searchParams.set("appid", this.config.env.WECHAT_APP_ID);
    endpoint.searchParams.set("secret", this.config.env.WECHAT_APP_SECRET);
    endpoint.searchParams.set("js_code", code);
    endpoint.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw Errors.providerRequestFailed("WeChat code exchange");
    }
    if (!response.ok) throw Errors.providerRequestFailed("WeChat code exchange");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw Errors.providerRequestFailed("WeChat code exchange");
    }
    if (!isWechatSessionPayload(payload)) {
      throw Errors.providerRequestFailed("WeChat code exchange");
    }
    if (typeof payload.errcode === "number" && payload.errcode !== 0) {
      throw Errors.providerRejected("WeChat code exchange", payload.errcode);
    }
    if (typeof payload.openid !== "string" || payload.openid.length === 0) {
      throw Errors.providerRequestFailed("WeChat code exchange");
    }
    // session_key is deliberately ignored and must never be returned or persisted.
    return { openId: payload.openid };
  }

  async verifyReward(_input: {
    challengeId: string;
    eventId: string;
  }): Promise<boolean> {
    if (this.config.env.WECHAT_MODE === "mock") {
      return this.config.env.NODE_ENV !== "production";
    }
    if (!this.config.env.WECHAT_APP_ID || !this.config.env.WECHAT_APP_SECRET) {
      throw Errors.providerNotConfigured("WeChat rewarded ad verification");
    }
    throw Errors.providerNotConfigured("WeChat rewarded ad verification");
  }
}

function isWechatSessionPayload(
  value: unknown
): value is { openid?: unknown; errcode?: unknown; session_key?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class VodProviderService implements VodProvider {
  constructor(
    private readonly config: AppConfigService,
    private readonly jwt: JwtService
  ) {}

  async createPlaybackUrl(mediaId: string, ttlSeconds: number): Promise<string> {
    if (this.config.env.VOD_MODE === "live") {
      if (
        !this.config.env.TENCENTCLOUD_SECRET_ID ||
        !this.config.env.TENCENTCLOUD_SECRET_KEY ||
        !this.config.env.VOD_PLAYBACK_KEY
      ) {
        throw Errors.providerNotConfigured("Tencent Cloud VOD playback");
      }
      throw Errors.providerNotConfigured("Tencent Cloud VOD playback signing");
    }
    const token = await this.jwt.signAsync(
      { scope: "playback", mediaId },
      { expiresIn: Math.min(PLAYBACK_TOKEN_TTL_SECONDS, ttlSeconds) }
    );
    return `https://${this.config.env.VOD_MEDIA_HOST}/${encodeURIComponent(mediaId)}.m3u8?token=${encodeURIComponent(token)}`;
  }

  isUploadReady(): boolean {
    return (
      this.config.env.VOD_MODE === "mock" ||
      Boolean(
        this.config.env.TENCENTCLOUD_SECRET_ID && this.config.env.TENCENTCLOUD_SECRET_KEY
      )
    );
  }

  async createUploadAuthorization(
    input: VodUploadAuthorizationInput
  ): Promise<VodUploadAuthorization> {
    const uploadId = input.uploadId ?? randomUUID();
    const expiresAtUnix = Math.floor(Date.now() / 1000) + POSTER_UPLOAD_TTL_SECONDS;
    const expiresAt = new Date(expiresAtUnix * 1000).toISOString();
    if (this.config.env.VOD_MODE === "live") {
      if (
        !this.config.env.TENCENTCLOUD_SECRET_ID ||
        !this.config.env.TENCENTCLOUD_SECRET_KEY
      ) {
        throw Errors.providerNotConfigured("Tencent Cloud VOD upload");
      }

      // The Web SDK consumes the client-upload signature, not the temporary
      // credentials returned by the server-side ApplyUpload API. Keep this
      // signing operation server-side and return only the opaque signature.
      const original = new URLSearchParams([
        ["secretId", this.config.env.TENCENTCLOUD_SECRET_ID],
        ["currentTimeStamp", String(Math.floor(Date.now() / 1000))],
        ["expireTime", String(expiresAtUnix)],
        ["random", String(randomBytes(4).readUInt32BE(0))],
        ["oneTimeValid", "1"],
        ...(this.config.env.TENCENTCLOUD_VOD_SUB_APP_ID
          ? [["vodSubAppId", this.config.env.TENCENTCLOUD_VOD_SUB_APP_ID] as [string, string]]
          : []),
        ...(this.config.env.TENCENTCLOUD_VOD_PROCEDURE
          ? [["procedure", this.config.env.TENCENTCLOUD_VOD_PROCEDURE] as [string, string]]
          : []),
        // The upload session id is safe context for the provider callback and
        // does not expose a credential or an end-user payload.
        ["sourceContext", uploadId],
        ...(this.config.env.TENCENTCLOUD_VOD_PROCEDURE
          ? [["sessionContext", uploadId] as [string, string]]
          : [])
      ]).toString();
      const signatureBytes = createHmac("sha1", this.config.env.TENCENTCLOUD_SECRET_KEY)
        .update(original)
        .digest();
      const signature = Buffer.concat([signatureBytes, Buffer.from(original, "utf8")]).toString(
        "base64"
      );
      return {
        provider: "TENCENT_VOD",
        uploadId,
        signature,
        expiresAt,
        mock: false
      };
    }
    return {
      provider: "MOCK",
      uploadUrl: `${this.config.env.PUBLIC_API_URL}/mock-vod-upload?filename=${encodeURIComponent(input.filename)}`,
      headers: { "x-microfocus-upload-mode": "mock" },
      uploadId: `mock-${uploadId}`,
      expiresAt,
      mock: true
    };
  }
}

export function verifyWebhookSignature(
  rawBody: string,
  suppliedSignature: string | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !suppliedSignature || suppliedSignature.length > PROVIDER_SIGNATURE_MAX_LENGTH) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = suppliedSignature.replace(/^sha256=/, "");
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

/** Tencent VOD 3.0 callback signature: MD5(SignKey + T), with T in the body. */
export function verifyTencentVodCallbackSignature(
  rawBody: Buffer | undefined,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!rawBody?.length || !secret) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return false;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const body = payload as Record<string, unknown>;
  const sign = typeof body.Sign === "string" ? body.Sign.toLowerCase() : "";
  const timestamp = typeof body.T === "number" ? body.T : Number(body.T);
  if (!/^[a-f0-9]{32}$/.test(sign) || !Number.isSafeInteger(timestamp)) return false;
  if (timestamp <= nowSeconds || timestamp > nowSeconds + 15 * 60) return false;
  const expected = createHash("md5").update(`${secret}${timestamp}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sign));
}

function stableIdentifier(value: string): string {
  return createHmac("sha256", "microfocus-local-mock")
    .update(value)
    .digest("hex")
    .slice(0, 32);
}
