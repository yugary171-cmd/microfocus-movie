<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { isMockMode } from "../../services/api";

type LegalSection = "privacy" | "terms" | "ads" | "support" | "deletion";

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
      { heading: "你的权利", body: "你可以通过「我的」页申请账号注销，或通过客服申请查询、更正依法可处理的个人信息。注销提交后登录立即失效；查询进度需保存一次性查询令牌。实际处理时限以发布前审核通过的正式政策为准。" }
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
  deletion: {
    title: "账号注销",
    updatedAt: "工程实现说明 · 保留矩阵尚未由法务批准",
    paragraphs: [
      { heading: "提交后立即生效的撤权", body: "注销申请提交后，账号进入待处理状态：用户登录失效，活动播放租约被撤销，未完成的奖励挑战不再发放。权益账本、事故证据和管理员审计不会因注销申请被删除。" },
      { heading: "查询令牌", body: "首次成功响应会返回 deletionQueryToken。服务端只保存令牌摘要。令牌遗失后不能用旧登录恢复查询，需走受控客服核验。当前实现尚未接入「近期重新认证证明」。" },
      { heading: "后续清理", body: "可删除个人信息的删除或匿名化依赖已批准的数据保留矩阵；在矩阵确认前，本申请只完成账户不可用与撤权，不假装已完成法定清理。" }
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

const isMock = isMockMode();
const section = ref<LegalSection>("privacy");
const content = computed(() => LEGAL_CONTENT[section.value]);

onLoad((options) => {
  const candidate = options?.section as LegalSection;
  section.value = candidate in LEGAL_CONTENT ? candidate : "privacy";
  uni.setNavigationBarTitle({ title: content.value.title });
});
</script>

<template>
  <view class="page legal-page">
    <internal-banner :visible="isMock" />
    <view class="page-title">{{ content.title }}</view>
    <view class="updated">{{ content.updatedAt }}</view>
    <view v-for="item in content.paragraphs" :key="item.heading" class="legal-section">
      <view class="heading">{{ item.heading }}</view>
      <view class="body">{{ item.body }}</view>
    </view>
    <view class="review-note" role="note">
      本页文字用于首版产品与开发评审，不替代正式法律文本。上线前须由运营主体与法务审核并补齐生效日期、主体信息和有效联系渠道。
    </view>
  </view>
</template>

<style scoped src="../../styles/legal.scss"></style>
