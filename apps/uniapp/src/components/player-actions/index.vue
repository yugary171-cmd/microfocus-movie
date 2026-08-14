<script setup lang="ts">
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
      <view class="glyph glyph-star" :class="{ active: favorited }" aria-hidden="true">★</view>
      <view class="label">{{ favoriteLabel }}</view>
    </view>
    <view class="action" role="button" aria-label="评论" hover-class="none" @tap="emit('comment')">
      <view class="glyph glyph-comment" aria-hidden="true"><view class="comment-dots">•••</view></view>
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
      <view class="glyph glyph-heart" :class="{ active: liked }" aria-hidden="true">♥</view>
      <view class="label">{{ likeLabel }}</view>
    </view>
    <view class="action" role="button" aria-label="分享" hover-class="none" @tap="emit('share')">
      <view class="glyph glyph-share" aria-hidden="true">➤</view>
      <view class="label">{{ shareLabel || "分享" }}</view>
    </view>
  </view>
</template>

<style scoped src="../../styles/player-actions.scss"></style>
