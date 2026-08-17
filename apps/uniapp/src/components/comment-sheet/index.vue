<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CommentView } from "@microfocus/contracts";
import { ACTION_ICONS, NAV_ICONS } from "../../constants/icons";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  cloneLocalComments,
  type LocalComment
} from "./comments";

const props = defineProps<{
  visible?: boolean;
  dramaTitle?: string;
  dramaId?: string;
  episodeId?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

type SheetComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
  replies: SheetComment[];
};

const draft = ref("");
const comments = ref<SheetComment[]>([]);
const expandedIds = ref<string[]>([]);
const replyTo = ref("");
const replyParentId = ref("");
const loading = ref(false);
const error = ref("");

const usesApi = computed(() => Boolean(props.dramaId?.trim()));

const totalCount = computed(() =>
  comments.value.reduce((total, item) => total + 1 + (item.replies.length || item.replyCount), 0)
);

function formatCommentTime(value: string): string {
  if (!value) return "";
  if (value === "刚刚") return value;
  return value.slice(0, 10);
}

function fromView(view: CommentView): SheetComment {
  return {
    id: view.id,
    author: view.author.displayName || "用户",
    text: view.body,
    createdAt: formatCommentTime(view.createdAt),
    likeCount: Math.max(0, view.likeCount),
    likedByMe: Boolean(view.likedByMe),
    replyCount: Math.max(0, view.replyCount),
    replies: []
  };
}

function fromLocal(item: LocalComment): SheetComment {
  return {
    id: item.id,
    author: item.author,
    text: item.text,
    createdAt: item.createdAt,
    likeCount: item.likeCount,
    likedByMe: false,
    replyCount: item.replies.length,
    replies: item.replies.map((reply) => ({
      id: reply.id,
      author: reply.author,
      text: reply.text,
      createdAt: reply.createdAt,
      likeCount: reply.likeCount,
      likedByMe: false,
      replyCount: 0,
      replies: []
    }))
  };
}

async function loadComments() {
  const dramaId = props.dramaId?.trim();
  if (!dramaId) {
    comments.value = cloneLocalComments().map(fromLocal);
    error.value = "";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const page = await getApi().social.getDramaComments(dramaId, 1);
    comments.value = (page.items ?? []).map(fromView);
  } catch (loadError) {
    error.value = toFriendlyErrorMessage(loadError);
    comments.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.dramaId] as const,
  ([visible]) => {
    if (!visible) return;
    void loadComments();
  }
);

function closeSheet() {
  draft.value = "";
  replyTo.value = "";
  replyParentId.value = "";
  emit("close");
}

function isLiked(item: SheetComment): boolean {
  return item.likedByMe;
}

async function toggleLike(target: SheetComment) {
  if (!usesApi.value) {
    target.likedByMe = !target.likedByMe;
    target.likeCount += target.likedByMe ? 1 : -1;
    return;
  }
  try {
    if (target.likedByMe) {
      await getApi().social.unlikeComment(target.id);
      target.likedByMe = false;
      target.likeCount = Math.max(0, target.likeCount - 1);
    } else {
      await getApi().social.likeComment(target.id);
      target.likedByMe = true;
      target.likeCount += 1;
    }
  } catch (likeError) {
    uni.showToast({ title: toFriendlyErrorMessage(likeError), icon: "none" });
  }
}

function isExpanded(id: string): boolean {
  return expandedIds.value.includes(id);
}

async function toggleReplies(item: SheetComment) {
  if (isExpanded(item.id)) {
    expandedIds.value = expandedIds.value.filter((entry) => entry !== item.id);
    return;
  }
  expandedIds.value = [...expandedIds.value, item.id];
  if (!usesApi.value || item.replies.length || !item.replyCount) return;
  try {
    const page = await getApi().social.getCommentReplies(item.id, 1);
    item.replies = (page.items ?? []).map(fromView);
  } catch (replyError) {
    uni.showToast({ title: toFriendlyErrorMessage(replyError), icon: "none" });
  }
}

function startReply(item: SheetComment) {
  replyTo.value = item.author;
  replyParentId.value = usesApi.value ? item.id : "";
  draft.value = `@${item.author} `;
}

function notifyUnsupported() {
  uni.showToast({ title: "配图暂不支持", icon: "none" });
}

async function submit() {
  const text = draft.value.trim();
  if (!text) {
    uni.showToast({ title: "请先写一条评论", icon: "none" });
    return;
  }
  if (!usesApi.value) {
    comments.value = [
      {
        id: `local-${Date.now()}`,
        author: "我",
        text,
        createdAt: "刚刚",
        likeCount: 0,
        likedByMe: false,
        replyCount: 0,
        replies: []
      },
      ...comments.value
    ];
    draft.value = "";
    replyTo.value = "";
    uni.showToast({ title: "评论仅本地展示，不会同步到服务端", icon: "none" });
    return;
  }
  try {
    const created = await getApi().social.createDramaComment(props.dramaId || "", {
      body: text,
      ...(replyParentId.value ? { parentCommentId: replyParentId.value } : {}),
      ...(props.episodeId ? { episodeId: props.episodeId } : {})
    });
    const sheet = fromView(created);
    if (replyParentId.value) {
      const parent = comments.value.find((item) => item.id === replyParentId.value);
      if (parent) {
        parent.replies = [sheet, ...parent.replies];
        parent.replyCount += 1;
        if (!isExpanded(parent.id)) expandedIds.value = [...expandedIds.value, parent.id];
      } else {
        comments.value = [sheet, ...comments.value];
      }
    } else {
      comments.value = [sheet, ...comments.value];
    }
    draft.value = "";
    replyTo.value = "";
    replyParentId.value = "";
  } catch (submitError) {
    uni.showToast({ title: toFriendlyErrorMessage(submitError), icon: "none" });
  }
}
</script>

<template>
  <view v-if="visible" class="sheet-root" role="dialog" :aria-label="`${dramaTitle || '本集'}评论`">
    <view class="mask" @tap="closeSheet" />
    <view class="panel">
      <view class="header">
        <button class="close" aria-label="收起评论" @tap="closeSheet"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></button>
        <view class="title">{{ totalCount }}条评论</view>
        <view class="header-spacer" />
      </view>
      <scroll-view class="list" scroll-y>
        <view v-if="loading" class="empty">正在读取评论…</view>
        <view v-else-if="error" class="empty" role="alert">{{ error }}</view>
        <view v-else-if="!comments.length" class="empty">还没有评论，来说一句吧</view>
        <view v-for="item in comments" :key="item.id" class="item">
          <view class="avatar">{{ item.author.slice(0, 1) }}</view>
          <view class="body">
            <view class="author">{{ item.author }}</view>
            <view class="text">{{ item.text }}</view>
            <view class="meta">
              <text>{{ item.createdAt }}</text>
              <button class="reply-link" @tap="startReply(item)">回复</button>
            </view>
            <button
              v-if="item.replyCount || item.replies.length"
              class="expand"
              @tap="toggleReplies(item)"
            >
              {{ isExpanded(item.id) ? "收起回复" : `展开${item.replyCount || item.replies.length}条回复` }}
            </button>
            <view v-if="isExpanded(item.id)" class="replies">
              <view v-for="reply in item.replies" :key="reply.id" class="item">
                <view class="avatar">{{ reply.author.slice(0, 1) }}</view>
                <view class="body">
                  <view class="author">{{ reply.author }}</view>
                  <view class="text">{{ reply.text }}</view>
                  <view class="meta">
                    <text>{{ reply.createdAt }}</text>
                    <button class="reply-link" @tap="startReply(reply)">回复</button>
                  </view>
                </view>
                <button
                  class="like"
                  :class="{ liked: isLiked(reply) }"
                  :aria-pressed="isLiked(reply)"
                  @tap="toggleLike(reply)"
                >
                  <image class="heart" :src="isLiked(reply) ? ACTION_ICONS.heartActive : ACTION_ICONS.heart" mode="aspectFit" aria-hidden="true" />
                  <view>{{ reply.likeCount }}</view>
                </button>
              </view>
            </view>
          </view>
          <button
            class="like"
            :class="{ liked: isLiked(item) }"
            :aria-pressed="isLiked(item)"
            @tap="toggleLike(item)"
          >
            <image class="heart" :src="isLiked(item) ? ACTION_ICONS.heartActive : ACTION_ICONS.heart" mode="aspectFit" aria-hidden="true" />
            <view>{{ item.likeCount }}</view>
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
        <button class="tool" aria-label="配图暂不支持" @tap="notifyUnsupported"><image :src="ACTION_ICONS.comment" mode="aspectFit" aria-hidden="true" /></button>
        <button class="send" @tap="submit">发送</button>
      </view>
    </view>
  </view>
</template>

<style scoped src="../../styles/comment-sheet.scss"></style>
