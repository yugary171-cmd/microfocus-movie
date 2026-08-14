<script setup lang="ts">
import type { DramaCard } from "@microfocus/contracts";

const props = defineProps<{
  drama?: DramaCard;
  compact?: boolean;
}>();

function open() {
  if (!props.drama?.id) return;
  uni.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(props.drama.id)}` });
}
</script>

<template>
  <view
    class="card"
    :class="{ compact }"
    role="button"
    :aria-label="`查看短剧 ${drama?.title}，共 ${drama?.episodeCount} 集`"
    @tap="open"
  >
    <image
      v-if="drama?.coverUrl"
      class="cover"
      :src="drama.coverUrl"
      mode="aspectFill"
      lazy-load
      :aria-label="`${drama.title}封面`"
    />
    <view v-else class="cover placeholder" aria-hidden="true">剧</view>
    <view class="content">
      <view class="title">{{ drama?.title }}</view>
      <view class="meta">{{ drama?.category }} · {{ drama?.episodeCount }} 集</view>
      <view class="summary">{{ drama?.summary }}</view>
      <view class="tags">
        <text v-for="tag in drama?.tags || []" :key="tag" class="tag">{{ tag }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped src="../../styles/drama-card.scss"></style>
