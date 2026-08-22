<script setup lang="ts">
import { clearStoredSession } from "@/shared/api";

function openProfile() {
  uni.navigateTo({ url: "/pages/profile/edit" });
}

function showFeedback() {
  uni.navigateTo({ url: "/pages/feedback/index" });
}

function logout() {
  clearStoredSession();
  uni.reLaunch({ url: "/pages/my/index" });
}
</script>

<template>
  <view class="settings-page">
    <view class="settings-group">
      <button class="settings-item" @tap="openProfile">
        <text class="settings-item-label">编辑资料</text>
        <image src="/static/icons/weui-arrow-right.svg" mode="aspectFit" aria-hidden="true" />
      </button>
      <button class="settings-item" @tap="showFeedback">
        <text class="settings-item-label">用户反馈</text>
        <image src="/static/icons/weui-arrow-right.svg" mode="aspectFit" aria-hidden="true" />
      </button>
      <button class="settings-item danger" @tap="logout">
        <text>退出登录</text>
      </button>
    </view>
  </view>
</template>

<style scoped src="../../styles/settings.scss"></style>
