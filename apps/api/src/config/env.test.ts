import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "mysql://local:local@localhost:3306/local",
  JWT_SECRET: "a-strong-local-jwt-secret-of-at-least-32-chars"
};

describe("production environment gate", () => {
  it("keeps external traffic blocked until live provider implementations exist", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        PUBLIC_API_URL: "https://api.example.invalid",
        ADMIN_ORIGIN: "https://admin.example.invalid",
        COMPLIANCE_ENTITY_APPROVED: "true",
        COMPLIANCE_MINIPROGRAM_FILING: "true",
        COMPLIANCE_WECHAT_CATEGORY: "true",
        COMPLIANCE_ADS_APPROVED: "true",
        WECHAT_MODE: "live",
        VOD_MODE: "live",
        WECHAT_REWARD_VERIFICATION: "server_verified",
        WECHAT_APP_ID: "wx-live-id",
        WECHAT_APP_SECRET: "live-secret-value",
        WECHAT_REWARDED_AD_UNIT_ID: "adunit-live",
        WECHAT_CALLBACK_SECRET: "live-callback-secret",
        TENCENTCLOUD_SECRET_ID: "live-secret-id",
        TENCENTCLOUD_SECRET_KEY: "live-secret-key",
        TENCENTCLOUD_VOD_SUB_APP_ID: "123456",
        TENCENTCLOUD_VOD_PROCEDURE: "live-procedure",
        TENCENTCLOUD_VOD_CALLBACK_SECRET: "live-vod-callback",
        VOD_PLAYBACK_KEY: "live-playback-key",
        TOTP_ENCRYPTION_KEY: "live-totp-key-that-is-at-least-32-characters"
      })
    ).toThrow("live VOD signing and rewarded-ad verification are not implemented");
  });

  it("allows mock providers outside production", () => {
    expect(() => loadEnv(base)).not.toThrow();
  });

  it("requires HTTPS for the administrator origin in production", () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: "production",
        PUBLIC_API_URL: "https://api.example.invalid",
        ADMIN_ORIGIN: "http://admin.example.invalid",
        COMPLIANCE_ENTITY_APPROVED: "true",
        COMPLIANCE_MINIPROGRAM_FILING: "true",
        COMPLIANCE_WECHAT_CATEGORY: "true",
        COMPLIANCE_ADS_APPROVED: "true",
        WECHAT_MODE: "live",
        VOD_MODE: "live",
        WECHAT_REWARD_VERIFICATION: "server_verified"
      })
    ).toThrow("ADMIN_ORIGIN must use HTTPS");
  });
});
