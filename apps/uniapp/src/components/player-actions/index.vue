<script setup lang="ts">
import { ACTION_ICONS } from "../../constants/icons";

defineProps<{
  favorited?: boolean;
  liked?: boolean;
  favoriteLabel: string;
  commentLabel: string;
  likeLabel: string;
  shareLabel?: string;
}>();

const emit = defineEmits<{
  favorite: [];
  comment: [];
  like: [];
  share: [];
}>();
</script>

<template>
  <view class="actions" aria-label="短剧互动">
    <view
      class="action"
      :class="{ favorited }"
      role="button"
      aria-label="收藏"
      :aria-pressed="favorited"
      hover-class="none"
      @tap="emit('favorite')"
    >
      <image class="glyph" :src="favorited ? ACTION_ICONS.starActive : ACTION_ICONS.star" mode="aspectFit" aria-hidden="true" />
      <view class="label">{{ favoriteLabel }}</view>
    </view>
    <view class="action" role="button" aria-label="评论" hover-class="none" @tap="emit('comment')">
      <image class="glyph" :src="ACTION_ICONS.comment" mode="aspectFit" aria-hidden="true" />
      <view class="label">{{ commentLabel }}</view>
    </view>
    <view
      class="action"
      :class="{ liked }"
      role="button"
      aria-label="点赞"
      :aria-pressed="liked"
      hover-class="none"
      @tap="emit('like')"
    >
      <image class="glyph" :src="liked ? ACTION_ICONS.heartActive : ACTION_ICONS.heart" mode="aspectFit" aria-hidden="true" />
      <view class="label">{{ likeLabel }}</view>
    </view>
    <view class="action" role="button" aria-label="分享" hover-class="none" @tap="emit('share')">
      <image class="glyph" :src="ACTION_ICONS.share" mode="aspectFit" aria-hidden="true" />
      <view class="label">{{ shareLabel || "分享" }}</view>
    </view>
  </view>
</template>

<style scoped src="../../styles/player-actions.scss"></style>
