export { createRewardedVideoAd, unsupportedRewardedAdMessage } from "./ads";
export type { RewardedAdCloseResult, RewardedAdHandle } from "./ads";
export {
  H5_APP_AUTH_UNSUPPORTED_MESSAGE,
  obtainWechatLoginCode
} from "./auth";
export {
  getClientPlatform,
  getEnvVersion,
  wechatMiniprogramAuthSupported,
  wechatRewardedAdsSupported
} from "./env";
export type { ClientPlatform, EnvVersion } from "./env";
export { request } from "./http";
export {
  createVideoContext,
  getNetworkType,
  offNetworkStatusChange,
  onNetworkStatusChange
} from "./media";
export { MULTI_END_POLICY } from "./multi-end";
export { getStorageSync, removeStorageSync, setStorageSync } from "./storage";
