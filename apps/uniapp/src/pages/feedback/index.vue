<script setup lang="ts">
import { ref } from "vue";

const feedback = ref("");

function submitFeedback() {
  if (!feedback.value.trim()) {
    uni.showToast({ title: "请输入反馈内容", icon: "none" });
    return;
  }
  uni.showToast({ title: "反馈已提交", icon: "success" });
  feedback.value = "";
}
</script>

<template>
  <view class="feedback-page">
    <view class="feedback-card">
      <textarea v-model="feedback" class="feedback-textarea" maxlength="1000" placeholder="请输入你的意见或建议" />
      <button class="feedback-submit" @tap="submitFeedback">提交</button>
    </view>
  </view>
</template>

<style scoped src="../../styles/feedback.scss"></style>
