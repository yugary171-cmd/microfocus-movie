import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PLAYBACK_TOKEN_TTL_SECONDS, PROVIDER_SIGNATURE_MAX_LENGTH } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";

export interface WechatProvider {
  exchangeCode(code: string): Promise<{ openId: string }>;
  verifyReward(input: { challengeId: string; eventId: string }): Promise<boolean>;
}

export interface VodProvider {
  createPlaybackUrl(mediaId: string, ttlSeconds: number): Promise<string>;
  createUploadAuthorization(filename: string): Promise<{
    uploadUrl: string;
    headers: Record<string, string>;
    uploadId: string;
    expiresAt: string;
    mock: boolean;
  }>;
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

  async createUploadAuthorization(filename: string): Promise<{
    uploadUrl: string;
    headers: Record<string, string>;
    uploadId: string;
    expiresAt: string;
    mock: boolean;
  }> {
    if (this.config.env.VOD_MODE === "live") {
      if (
        !this.config.env.TENCENTCLOUD_SECRET_ID ||
        !this.config.env.TENCENTCLOUD_SECRET_KEY
      ) {
        throw Errors.providerNotConfigured("Tencent Cloud VOD upload");
      }
      throw Errors.providerNotConfigured("Tencent Cloud VOD upload signing");
    }
    return {
      uploadUrl: `${this.config.env.PUBLIC_API_URL}/mock-vod-upload?filename=${encodeURIComponent(filename)}`,
      headers: { "x-microfocus-upload-mode": "mock" },
      uploadId: `mock-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
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

function stableIdentifier(value: string): string {
  return createHmac("sha256", "microfocus-local-mock")
    .update(value)
    .digest("hex")
    .slice(0, 32);
}
