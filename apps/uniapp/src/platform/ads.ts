import { getClientPlatform, wechatRewardedAdsSupported } from "./env";

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

export function unsupportedRewardedAdMessage(): string {
  if (getClientPlatform() === "h5") {
    return "请在微信小程序观看广告解锁";
  }
  return "App 激励广告需接入独立广告 SDK，并由服务端按 platform 校验，不能沿用微信 isEnded";
}

function createUnsupportedRewardedAd(): RewardedAdHandle {
  const errorListeners = new Set<(error: unknown) => void>();
  const fail = () => {
    const error = new Error(unsupportedRewardedAdMessage());
    errorListeners.forEach((listener) => listener(error));
    return Promise.reject(error);
  };
  return {
    load: fail,
    show: fail,
    onClose: () => undefined,
    offClose: () => undefined,
    onError: (listener) => {
      errorListeners.add(listener);
    },
    offError: (listener) => {
      errorListeners.delete(listener);
    }
  };
}

export function createRewardedVideoAd(adUnitId: string): RewardedAdHandle {
  if (!wechatRewardedAdsSupported()) {
    return createUnsupportedRewardedAd();
  }
  const ad = uni.createRewardedVideoAd({ adUnitId });
  return {
    load: () => ad.load(),
    show: () => ad.show(),
    onClose: (listener) => ad.onClose(listener),
    offClose: (listener) => ad.offClose(listener),
    onError: (listener) => ad.onError(listener),
    offError: (listener) => ad.offError(listener)
  };
}
