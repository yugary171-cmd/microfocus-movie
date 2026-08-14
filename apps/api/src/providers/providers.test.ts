import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_SIGNATURE_MAX_LENGTH } from "@microfocus/contracts";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, WechatProviderService } from "./providers.js";

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
});
