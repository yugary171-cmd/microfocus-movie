export interface RewardedAdCloseResult {
  isEnded?: boolean;
}

export interface RewardedAdHandle {
  load(): Promise<void>;
  show(): Promise<void>;
  onClose(listener: (result: RewardedAdCloseResult) => void): void;
  offClose(listener: (result: RewardedAdCloseResult) => void): void;
  onError(listener: (error: unknown) => void): void;
  offError(listener: (error: unknown) => void): void;
}

export type WechatUserProfile = {
  displayName: string;
  avatarUrl: string | null;
};

export interface WechatAdapter {
  login(): Promise<string>;
  getUserProfile(): Promise<WechatUserProfile>;
  request<T>(options: WechatMiniprogram.RequestOption): Promise<T>;
  createRewardedVideoAd(adUnitId: string): RewardedAdHandle;
  getEnvVersion(): "develop" | "trial" | "release";
}

export const WECHAT_USER_PROFILE_DESC = "用于同步观看记录并展示头像昵称";

export function isWechatProfileAuthorizationDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /getUserProfile:fail.*(auth deny|cancel)/i.test(message);
}

/** Mock mode may use the fallback profile when DevTools cannot read avatar metadata. */
export function isWechatProfileUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /getUserProfile:fail.*getUserAvatarInfo fail/i.test(message);
}

export const wechatAdapter: WechatAdapter = {
  login: () =>
    new Promise((resolve, reject) => {
      wx.login({
        success: ({ code }) => (code ? resolve(code) : reject(new Error("微信登录未返回 code"))),
        fail: reject
      });
    }),

  getUserProfile: () =>
    new Promise((resolve, reject) => {
      if (typeof wx.getUserProfile !== "function") {
        reject(new Error("当前微信版本不支持头像昵称授权"));
        return;
      }
      wx.getUserProfile({
        desc: WECHAT_USER_PROFILE_DESC,
        success: ({ userInfo }) => {
          const displayName = typeof userInfo?.nickName === "string" ? userInfo.nickName.trim().slice(0, 32) : "";
          const avatarUrl =
            typeof userInfo?.avatarUrl === "string" && userInfo.avatarUrl.trim() ? userInfo.avatarUrl.trim() : null;
          resolve({
            displayName: displayName || "微信用户",
            avatarUrl
          });
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || "微信授权失败"));
        }
      });
    }),

  request: <T>(options: WechatMiniprogram.RequestOption) =>
    new Promise<T>((resolve, reject) => {
      wx.request({
        ...options,
        success: (response) => resolve(response as T),
        fail: reject
      });
    }),

  createRewardedVideoAd: (adUnitId) => wx.createRewardedVideoAd({ adUnitId }),

  getEnvVersion: () => {
    try {
      return wx.getAccountInfoSync().miniProgram.envVersion;
    } catch {
      return "develop";
    }
  }
};
