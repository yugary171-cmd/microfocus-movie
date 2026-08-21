<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi, getStoredSession } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

const feedback = ref("");
const items = ref<Array<{ id: string; body: string; status: string; createdAt: string; replies: Array<{ body: string; createdAt: string }> }>>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");

async function load() {
  if (!getStoredSession()) return;
  loading.value = true;
  error.value = "";
  try {
    items.value = (await getApi().listFeedback(1)).items;
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function submitFeedback() {
  if (!getStoredSession()) {
    uni.showToast({ title: "请先登录后提交反馈", icon: "none" });
    return;
  }
  if (!feedback.value.trim()) {
    uni.showToast({ title: "请输入反馈内容", icon: "none" });
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    await getApi().createFeedback({ body: feedback.value.trim() });
    feedback.value = "";
    uni.showToast({ title: "反馈已提交", icon: "success" });
    await load();
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
  } finally {
    submitting.value = false;
  }
}

onShow(() => void load());
</script>

<template>
  <view class="feedback-page">
    <view v-if="!getStoredSession()" class="feedback-tip">请先登录后提交反馈。</view>
    <view class="feedback-card">
      <textarea v-model="feedback" class="feedback-textarea" maxlength="1000" placeholder="请输入你的意见或建议" />
      <button class="feedback-submit" :disabled="submitting" @tap="submitFeedback">{{ submitting ? "提交中…" : "提交" }}</button>
    </view>
    <view v-if="error" class="feedback-error">{{ error }}</view>
    <view v-if="loading" class="feedback-empty">正在读取历史反馈…</view>
    <view v-else-if="items.length" class="feedback-history">
      <view v-for="item in items" :key="item.id" class="feedback-history-card">
        <view class="feedback-history-meta">{{ item.createdAt.slice(0, 10) }} · {{ item.status === "RESOLVED" ? "已解决" : item.status === "PROCESSING" ? "处理中" : "待处理" }}</view>
        <view class="feedback-history-body">{{ item.body }}</view>
        <view v-for="reply in item.replies" :key="reply.createdAt" class="feedback-reply">管理员回复：{{ reply.body }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped src="../../styles/feedback.scss"></style>
