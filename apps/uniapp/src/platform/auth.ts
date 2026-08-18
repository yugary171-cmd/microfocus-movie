import { wechatMiniprogramAuthSupported } from "./env";

export const H5_APP_AUTH_UNSUPPORTED_MESSAGE =
  "H5 与 App 不能使用微信小程序登录，也不应调用 /v1/auth/wechat。请使用独立身份（短信/账号）或游客模式。";

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
