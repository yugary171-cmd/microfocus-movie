<script setup lang="ts">
import { reactive, ref } from "vue";

const tasks = reactive([
  { id: "sign", title: "每日签到", subtitle: "连续签到可领取体验时长", reward: "+ 20 分钟", done: false },
  { id: "follow", title: "关注好剧", subtitle: "收藏一部想看的短剧", reward: "+ 10 分钟", done: false },
  { id: "invite", title: "邀请好友", subtitle: "好友首次进入剧场后到账", reward: "+ 60 分钟", done: false }
]);
const balance = ref("80 分钟");

function claim(id: string) {
  const current = tasks.find((task) => task.id === id);
  if (!current || current.done) return;
  current.done = true;
  uni.showToast({ title: "Mock 福利已领取", icon: "success" });
}
</script>

<template>
  <view class="welfare-page">
    <view class="balance-card">
      <view class="balance-label">体验权益余额</view>
      <view class="balance-value">{{ balance }}</view>
      <view class="balance-note">Mock 数据 · 仅用于本地体验</view>
    </view>
    <view class="section-title">每日福利</view>
    <view v-for="item in tasks" :key="item.id" class="task-card">
      <view class="task-copy">
        <view class="task-title">{{ item.title }}</view>
        <view class="task-subtitle">{{ item.subtitle }}</view>
      </view>
      <view class="task-side">
        <view class="task-reward">{{ item.reward }}</view>
        <button class="claim" :class="{ claimed: item.done }" :disabled="item.done" @tap="claim(item.id)">
          {{ item.done ? "已领取" : "领取" }}
        </button>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #f7f7f8;
  color: #202025;
}
</style>
<style scoped src="../../styles/welfare.scss"></style>
