<script setup lang="ts">
defineProps<{
  visible: boolean;
  episodeNumber: number;
  unlockCopy: string;
  loading: boolean;
  retryPending: boolean;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <view v-if="visible" class="unlock-overlay" @tap="emit('close')">
    <view class="unlock-dialog" role="dialog" aria-modal="true" aria-label="观看广告解锁" @tap.stop>
      <view class="unlock-title">观看广告，获得本剧时长</view>
      <view class="unlock-copy">
        第 {{ episodeNumber }} 集需要当前短剧观看时长。{{ unlockCopy }}请主动点击下方按钮。
      </view>
      <view class="unlock-note">广告完成回调并非绝对安全证明，最终发放结果以服务端校验为准。</view>
      <view v-if="error" class="unlock-error" role="alert">{{ error }}</view>
      <button class="primary-button" :loading="loading" :disabled="loading" @tap="emit('confirm')">
        {{ retryPending ? "重试确认奖励" : "主动观看激励广告" }}
      </button>
      <button class="secondary-button unlock-cancel" :disabled="loading" @tap="emit('close')">暂不观看</button>
    </view>
  </view>
</template>

<style scoped src="./reward-unlock-sheet.scss"></style>
