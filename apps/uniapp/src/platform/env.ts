export type ClientPlatform = "mp-weixin" | "h5" | "app" | "unknown";
export type EnvVersion = "develop" | "trial" | "release";

function platformOverride(): ClientPlatform | "" {
  if (typeof process === "undefined") return "";
  const value = process.env.MICROFOCUS_CLIENT_PLATFORM;
  if (value === "mp-weixin" || value === "h5" || value === "app") return value;
  return "";
}

export function getClientPlatform(): ClientPlatform {
  const override = platformOverride();
  if (override) return override;
  // #ifdef MP-WEIXIN
  return "mp-weixin";
  // #endif
  // #ifdef H5
  return "h5";
  // #endif
  // #ifdef APP-PLUS
  return "app";
  // #endif
  return "unknown";
}

export function getEnvVersion(): EnvVersion {
  if (getClientPlatform() === "mp-weixin") {
    try {
      const account = uni.getAccountInfoSync?.();
      const version = account?.miniProgram?.envVersion;
      if (version === "develop" || version === "trial" || version === "release") {
        return version;
      }
    } catch {
      return "develop";
    }
    return "develop";
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return "develop";
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return "develop";
  return "release";
}

export function wechatMiniprogramAuthSupported(): boolean {
  return getClientPlatform() === "mp-weixin";
}

export function wechatRewardedAdsSupported(): boolean {
  return getClientPlatform() === "mp-weixin";
}
