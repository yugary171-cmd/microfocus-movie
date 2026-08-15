import { wechatMiniprogramAuthSupported } from "./env";

export const H5_APP_AUTH_UNSUPPORTED_MESSAGE =
  "H5 与 App 不能使用微信小程序登录，也不应调用 /v1/auth/wechat。请使用独立身份（短信/账号）或游客模式。";

/** Shown in the WeChat nickname/avatar authorization sheet. Must stay within WeChat's desc limit. */
export const WECHAT_USER_PROFILE_DESC = "用于同步观看记录并展示头像昵称";

export type WechatUserProfile = {
  displayName: string;
  avatarUrl: string | null;
};

export function isWechatProfileAuthorizationDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /getUserProfile:fail.*(auth deny|cancel)/i.test(message);
}

function profileFromUserInfo(userInfo: { nickName?: string; avatarUrl?: string } | undefined): WechatUserProfile {
  const displayName = typeof userInfo?.nickName === "string" ? userInfo.nickName.trim().slice(0, 32) : "";
  const avatarUrl =
    typeof userInfo?.avatarUrl === "string" && userInfo.avatarUrl.trim() ? userInfo.avatarUrl.trim() : null;
  return {
    displayName: displayName || "微信用户",
    avatarUrl
  };
}

export async function obtainWechatUserProfile(): Promise<WechatUserProfile> {
  if (!wechatMiniprogramAuthSupported()) {
    throw new Error(H5_APP_AUTH_UNSUPPORTED_MESSAGE);
  }
  if (typeof uni.getUserProfile !== "function") {
    throw new Error("当前微信版本不支持头像昵称授权");
  }
  return new Promise((resolve, reject) => {
    uni.getUserProfile({
      desc: WECHAT_USER_PROFILE_DESC,
      success: ({ userInfo }) => resolve(profileFromUserInfo(userInfo)),
      fail: (error) => {
        const message =
          error && typeof error === "object" && "errMsg" in error
            ? String((error as { errMsg: string }).errMsg)
            : "微信授权失败";
        reject(new Error(message));
      }
    });
  });
}

export async function obtainWechatLoginCode(): Promise<string> {
  if (!wechatMiniprogramAuthSupported()) {
    throw new Error(H5_APP_AUTH_UNSUPPORTED_MESSAGE);
  }
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: ({ code }) => (code ? resolve(code) : reject(new Error("微信登录未返回 code"))),
      fail: reject
    });
  });
}
