<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";

const items = ref<Array<{ id: string; title: string; body: string; createdAt: string; readAt?: string | null }>>([]);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getApi().getNotifications(1);
    items.value = Array.isArray(result.items) ? result.items : [];
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function open(item: (typeof items.value)[number]) {
  if (!item.readAt) {
    try {
      await getApi().markNotificationRead(item.id);
      item.readAt = new Date().toISOString();
    } catch {
      // Reading is best effort; the notification remains visible.
    }
  }
}

onShow(() => void load());
</script>

<template>
  <view class="notification-page">
    <view v-if="loading" class="state">正在读取通知…</view>
    <view v-else-if="error" class="state error" @tap="load">{{ error }}，点击重试</view>
    <view v-else-if="items.length === 0" class="state">暂无系统通知</view>
    <view v-else class="notification-list">
      <view v-for="item in items" :key="item.id" class="notification-card" :class="{ unread: !item.readAt }" @tap="open(item)">
        <view class="notification-heading"><text class="notification-title">{{ item.title }}</text><text class="notification-date">{{ item.createdAt.slice(0, 10) }}</text></view>
        <view class="notification-body">{{ item.body }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.notification-page { min-height: 100vh; padding: 24rpx; box-sizing: border-box; background: #f7f7f8; }
.notification-card { margin-bottom: 20rpx; padding: 28rpx; border-radius: 20rpx; background: #fff; }
.notification-card.unread { box-shadow: inset 6rpx 0 #ff7a35; }
.notification-heading { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; }
.notification-title { color: #24242a; font-size: 30rpx; font-weight: 600; }
.notification-date { color: #96969e; font-size: 22rpx; }
.notification-body { margin-top: 20rpx; color: #666671; font-size: 26rpx; line-height: 1.7; white-space: pre-wrap; }
.state { padding: 160rpx 30rpx; color: #96969e; font-size: 26rpx; text-align: center; }
.error { color: #c84b45; }
</style>
