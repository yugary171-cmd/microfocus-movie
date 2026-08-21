import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_SIGNATURE_MAX_LENGTH } from "@microfocus/contracts";
import { createHash, createHmac } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { CosProviderService } from "./cos.js";
import {
  verifyWebhookSignature,
  verifyTencentVodCallbackSignature,
  VodProviderService,
  WechatProviderService
} from "./providers.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function liveConfig() {
  return {
    env: {
      WECHAT_MODE: "live",
      WECHAT_APP_ID: "wx-app-id",
      WECHAT_APP_SECRET: "wx-secret",
      NODE_ENV: "test"
    }
  } as never;
}

describe("WeChat code2Session provider", () => {
  it("returns only openId and sends the official parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ openid: "open-id", session_key: "must-not-leak", unionid: "union" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    globalThis.fetch = fetchMock;

    const result = await new WechatProviderService(liveConfig()).exchangeCode("login-code");

    expect(result).toEqual({ openId: "open-id" });
    expect(result).not.toHaveProperty("session_key");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://api.weixin.qq.com/sns/jscode2session");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      appid: "wx-app-id",
      secret: "wx-secret",
      js_code: "login-code",
      grant_type: "authorization_code"
    });
  });

  it("fails safely on provider errcode or missing openid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), { status: 200 })
    );
    await expect(
      new WechatProviderService(liveConfig()).exchangeCode("invalid")
    ).rejects.toMatchObject({ code: "PROVIDER_REJECTED" });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ session_key: "secret" }), { status: 200 })
    );
    await expect(
      new WechatProviderService(liveConfig()).exchangeCode("missing-openid")
    ).rejects.toMatchObject({ code: "PROVIDER_REQUEST_FAILED" });
  });
});

describe("webhook signature bounds", () => {
  it("rejects an oversized signature without hashing it as valid", () => {
    const secret = "callback-secret";
    const body = "{\"eventId\":\"event-1\"}";
    const valid = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, valid, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "s".repeat(PROVIDER_SIGNATURE_MAX_LENGTH + 1), secret)).toBe(
      false
    );
  });

  it("verifies Tencent VOD body Sign/T without accepting an expired callback", () => {
    const secret = "callback-secret";
    const now = 1_700_000_000;
    const timestamp = now + 600;
    const sign = createHash("md5").update(`${secret}${timestamp}`).digest("hex");
    const body = Buffer.from(JSON.stringify({ Sign: sign, T: timestamp }));
    expect(verifyTencentVodCallbackSignature(body, secret, now)).toBe(true);
    expect(verifyTencentVodCallbackSignature(body, secret, timestamp)).toBe(false);
  });
});

describe("upload providers", () => {
  it("keeps poster uploads in the internal mock path without live credentials", async () => {
    const provider = new CosProviderService({
      env: {
        POSTER_STORAGE_MODE: "mock",
        PUBLIC_API_URL: "http://localhost:3000",
        TENCENTCLOUD_COS_PREFIX: "microfocus/dramas"
      }
    } as never);
    const result = await provider.createPosterUploadAuthorization({
      kind: "cover",
      fileName: "cover.png",
      contentType: "image/png"
    });
    expect(result).toMatchObject({ mock: true, objectKey: expect.stringContaining("pending/cover") });
    expect(result.uploadUrl).toContain("mock-poster-upload");
    expect(result.assetUrl).toContain("mock-poster");
  });

  it("fails closed when live COS configuration is incomplete", async () => {
    const provider = new CosProviderService({
      env: { POSTER_STORAGE_MODE: "live" }
    } as never);
    await expect(
      provider.createPosterUploadAuthorization({
        kind: "promo",
        fileName: "promo.jpg",
        contentType: "image/jpeg"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });

  it("returns a VOD Web SDK signature without returning the cloud secret key", async () => {
    const secretKey = "vod-secret-key";
    const provider = new VodProviderService(
      {
        env: {
          VOD_MODE: "live",
          TENCENTCLOUD_SECRET_ID: "vod-secret-id",
          TENCENTCLOUD_SECRET_KEY: secretKey,
          TENCENTCLOUD_VOD_SUB_APP_ID: "123456",
          TENCENTCLOUD_VOD_PROCEDURE: "microfocus-procedure"
        }
      } as never,
      new JwtService()
    );
    const result = await provider.createUploadAuthorization({
      filename: "episode.mp4",
      size: 1024,
      contentType: "video/mp4",
      dramaId: "drama-1",
      episodeId: "episode-1",
      uploadId: "upload-1"
    });
    expect(result).toMatchObject({ provider: "TENCENT_VOD", uploadId: "upload-1", mock: false });
    expect(result).not.toHaveProperty("headers");
    expect(result).not.toHaveProperty("uploadUrl");
    expect(result.signature).toBeTruthy();
    expect(result.signature).not.toContain(secretKey);
    const original = Buffer.from(result.signature!, "base64").subarray(20).toString("utf8");
    expect(original).toContain("secretId=vod-secret-id");
    expect(original).toContain("vodSubAppId=123456");
    expect(original).toContain("procedure=microfocus-procedure");
    expect(original).toContain("sessionContext=upload-1");
  });
});
