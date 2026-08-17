<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  cloneLocalComments,
  countLocalComments,
  type LocalComment
} from "./comments";

const props = defineProps<{
  visible?: boolean;
  dramaTitle?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const draft = ref("");
const comments = ref<LocalComment[]>(cloneLocalComments());
const likedIds = ref<string[]>([]);
const expandedIds = ref<string[]>([]);
const replyTo = ref("");

const totalCount = computed(() => countLocalComments(comments.value));

watch(
  () => props.visible,
  (visible) => {
    if (visible && comments.value.length === 0) comments.value = cloneLocalComments();
  }
);

function closeSheet() {
  draft.value = "";
  replyTo.value = "";
  emit("close");
}

function isLiked(id: string): boolean {
  return likedIds.value.includes(id);
}

function toggleLike(id: string) {
  likedIds.value = isLiked(id)
    ? likedIds.value.filter((item) => item !== id)
    : [...likedIds.value, id];
}

function likeCount(base: number, id: string): number {
  return base + (isLiked(id) ? 1 : 0);
}

function isExpanded(id: string): boolean {
  return expandedIds.value.includes(id);
}

function toggleReplies(id: string) {
  expandedIds.value = isExpanded(id)
    ? expandedIds.value.filter((item) => item !== id)
    : [...expandedIds.value, id];
}

function startReply(author: string) {
  replyTo.value = author;
  draft.value = `@${author} `;
}

function notifyLocalOnly() {
  uni.showToast({ title: "评论仅本地展示，不会同步到服务端", icon: "none" });
}

function submit() {
  const text = draft.value.trim();
  if (!text) {
    uni.showToast({ title: "请先写一条评论", icon: "none" });
    return;
  }
  comments.value = [
    {
      id: `local-${Date.now()}`,
      author: "我",
      text,
      createdAt: "刚刚",
      likeCount: 0,
      replies: []
    },
    ...comments.value
  ];
  draft.value = "";
  replyTo.value = "";
  notifyLocalOnly();
}
</script>

<template>
  <view v-if="visible" class="sheet-root" role="dialog" :aria-label="`${dramaTitle || '本集'}评论`">
    <view class="mask" @tap="closeSheet" />
    <view class="panel">
      <view class="header">
        <button class="close" aria-label="收起评论" @tap="closeSheet">﹀</button>
        <view class="title">{{ totalCount }}条评论</view>
        <view class="header-spacer" />
      </view>
      <scroll-view class="list" scroll-y>
        <view v-if="!comments.length" class="empty">还没有评论，来说一句吧</view>
        <view v-for="item in comments" :key="item.id" class="item">
          <view class="avatar">{{ item.author.slice(0, 1) }}</view>
          <view class="body">
            <view class="author">{{ item.author }}</view>
            <view class="text">{{ item.text }}</view>
            <view class="meta">
              <text>{{ item.createdAt }}</text>
              <button class="reply-link" @tap="startReply(item.author)">回复</button>
            </view>
            <button
              v-if="item.replies.length"
              class="expand"
              @tap="toggleReplies(item.id)"
            >
              {{ isExpanded(item.id) ? "收起回复" : `展开${item.replies.length}条回复` }}
            </button>
            <view v-if="isExpanded(item.id)" class="replies">
              <view v-for="reply in item.replies" :key="reply.id" class="item">
                <view class="avatar">{{ reply.author.slice(0, 1) }}</view>
                <view class="body">
                  <view class="author">{{ reply.author }}</view>
                  <view class="text">{{ reply.text }}</view>
                  <view class="meta">
                    <text>{{ reply.createdAt }}</text>
                    <button class="reply-link" @tap="startReply(reply.author)">回复</button>
                  </view>
                </view>
                <button
                  class="like"
                  :class="{ liked: isLiked(reply.id) }"
                  :aria-pressed="isLiked(reply.id)"
                  @tap="toggleLike(reply.id)"
                >
                  <view class="heart">{{ isLiked(reply.id) ? "♥" : "♡" }}</view>
                  <view>{{ likeCount(reply.likeCount, reply.id) }}</view>
                </button>
              </view>
            </view>
          </view>
          <button
            class="like"
            :class="{ liked: isLiked(item.id) }"
            :aria-pressed="isLiked(item.id)"
            @tap="toggleLike(item.id)"
          >
            <view class="heart">{{ isLiked(item.id) ? "♥" : "♡" }}</view>
            <view>{{ likeCount(item.likeCount, item.id) }}</view>
          </button>
        </view>
      </scroll-view>
      <view class="composer">
        <input
          class="input"
          v-model="draft"
          confirm-type="send"
          placeholder="有趣评论千万，不如你也来一条？"
          placeholder-class="placeholder"
          :aria-label="replyTo ? `回复 ${replyTo}` : '发表评论'"
          @confirm="submit"
        />
        <button class="tool" aria-label="配图暂不支持" @tap="notifyLocalOnly">▣</button>
        <button class="send" @tap="submit">发送</button>
      </view>
    </view>
  </view>
</template>

<style scoped src="../../styles/comment-sheet.scss"></style>
