/**
 * Cross-end identity and ads are intentionally not unified.
 *
 * WeChat mini program: uni.login -> POST /v1/auth/wechat; rewarded ads use
 * WeChat isEnded and the existing challenge complete API.
 *
 * H5: never call /v1/auth/wechat or pretend rewarded ads exist. Browse in
 * mock as a guest, or add a separate identity later. Locked episodes show
 * "请在微信小程序观看广告解锁".
 *
 * App: add a non-WeChat auth route and a mobile ad SDK. The server must
 * verify by platform; WeChat isEnded is not an App completion proof.
 */
export const MULTI_END_POLICY = {
  wechatAuthPath: "/v1/auth/wechat",
  h5Auth: "guest_or_separate_identity",
  appAuth: "open_platform_or_phone",
  h5Ads: "redirect_to_wechat_miniprogram",
  appAds: "independent_sdk_with_server_platform_check"
} as const;
