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

export interface WechatAdapter {
  login(): Promise<string>;
  request<T>(options: WechatMiniprogram.RequestOption): Promise<T>;
  createRewardedVideoAd(adUnitId: string): RewardedAdHandle;
  getEnvVersion(): "develop" | "trial" | "release";
}

export const wechatAdapter: WechatAdapter = {
  login: () =>
    new Promise((resolve, reject) => {
      wx.login({
        success: ({ code }) => (code ? resolve(code) : reject(new Error("微信登录未返回 code"))),
        fail: reject
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
