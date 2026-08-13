import { isMockMode } from "../../services/api";

type LegalSection = "privacy" | "terms" | "ads" | "support";

const LEGAL_CONTENT: Record<
  LegalSection,
  { title: string; updatedAt: string; paragraphs: Array<{ heading: string; body: string }> }
> = {
  privacy: {
    title: "隐私政策",
    updatedAt: "首版占位文本 · 发布前需法务审核",
    paragraphs: [
      { heading: "我们处理的信息", body: "为提供登录、播放、进度同步与客服功能，服务可能处理微信登录临时凭证换取的服务端会话、设备标识、观看进度、网络状态及必要的故障信息。小程序端不保存微信登录 code，也不应包含服务端密钥。" },
      { heading: "使用目的", body: "相关信息仅用于身份识别、内容展示、播放授权、权益计时、观看记录同步、安全风控与问题处理。" },
      { heading: "你的权利", body: "你可以通过客服与投诉入口申请查询、更正或删除依法可处理的个人信息，或反馈隐私问题。实际处理方式与时限以发布前审核通过的正式政策为准。" }
    ]
  },
  terms: {
    title: "用户协议",
    updatedAt: "首版占位文本 · 发布前需法务审核",
    paragraphs: [
      { heading: "服务范围", body: "本服务提供已获得上线条件的短剧内容浏览、播放、观看进度与限时权益功能。内容可用性可能因授权、备案、审核或运营安排调整。" },
      { heading: "使用约定", body: "请勿以自动化、篡改、重放或其他不正当方式绕过播放授权、广告完成校验或权益计时，也不要传播违法违规内容。" },
      { heading: "服务变更", body: "在符合法律法规与平台规则的前提下，服务可能更新功能或暂停部分内容。正式发布版本应补充运营主体、适用法律、争议解决等信息。" }
    ]
  },
  ads: {
    title: "广告与权益规则",
    updatedAt: "首版规则说明",
    paragraphs: [
      { heading: "主动触发", body: "激励广告不会自动弹出。只有当你选择锁定剧集并主动点击“观看激励广告”时，才会尝试加载。" },
      { heading: "发放条件", body: "广告完整播放且客户端收到 isEnded=true 后，才会提交领取；中途关闭、加载失败或回调不完整均不提交完成。客户端回调不是绝对安全证明，服务端仍会校验挑战时效、状态、重放与风险信息，最终结果以服务端为准。" },
      { heading: "使用与到期", body: "权益仅适用于领取时对应的当前短剧，并按实际播放消耗；暂停、缓冲、进入后台不应扣减。不同批次权益可能有各自到期时间，优先消耗临近到期的时长。" }
    ]
  },
  support: {
    title: "客服与投诉",
    updatedAt: "发布前需配置正式主体与渠道",
    paragraphs: [
      { heading: "内容与版权投诉", body: "如发现内容侵权、备案信息异常或其他内容问题，请在正式上线后通过小程序客服提交剧名、集数、问题说明与可核验材料。" },
      { heading: "广告与权益申诉", body: "如完整观看后权益未到账，请提供短剧名称、发生时间与页面提示。请勿发送密码、验证码、支付口令或其他敏感凭证。" },
      { heading: "未成年人保护与违法内容", body: "涉及未成年人保护、违法有害内容或紧急安全问题，请使用发布主体提供的正式投诉渠道。当前首版不硬编码未经确认的电话、邮箱或企业信息。" }
    ]
  }
};

Page({
  data: {
    isMock: isMockMode(),
    section: "privacy" as LegalSection,
    title: LEGAL_CONTENT.privacy.title,
    updatedAt: LEGAL_CONTENT.privacy.updatedAt,
    paragraphs: LEGAL_CONTENT.privacy.paragraphs
  },

  onLoad(options: Record<string, string | undefined>) {
    const candidate = options.section as LegalSection;
    const section = candidate in LEGAL_CONTENT ? candidate : "privacy";
    const content = LEGAL_CONTENT[section];
    this.setData({ section, ...content });
    wx.setNavigationBarTitle({ title: content.title });
  }
});
