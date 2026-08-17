<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import CommentSheet from "../../components/comment-sheet/index.vue";
import PlayerActions from "../../components/player-actions/index.vue";
import { ACTION_ICONS, NAV_ICONS } from "../../constants/icons";
import { RUNTIME_CONFIG } from "../../config/runtime";
import { getClientPlatform } from "../../platform/env";
import { shareDramaText, shareIfExternallyAllowed } from "../../utils/engagement";
import { holdBoostRate, restoreHoldRate } from "../../utils/playback-gesture";

type TheaterAction = "favorite" | "comment" | "like" | "share";
type TheaterVideo = {
  id: string;
  url: string;
  dramaTitle: string;
  episodeLabel: string;
  description: string;
  favoriteCount: string;
  commentCount: string;
  likeCount: string;
  shareCount: string;
  tone: "mist" | "rose";
};

const THEATER_CLIPS = [
  {
    id: "moonlight-memory",
    dramaTitle: "她在月光下失忆",
    episodeLabel: "第 08 集 · 月光不会说谎",
    description: "她终于想起那晚的约定，而他仍在原地等她回头。",
    favoriteCount: "2.8 万",
    commentCount: "1,206",
    likeCount: "9.6 万",
    shareCount: "3,412",
    tone: "mist" as const
  },
  {
    id: "reverse-summer",
    dramaTitle: "再考公",
    episodeLabel: "第 01 集 · 重启的夏天",
    description: "她决定重新出发，把每一次不甘心都变成向前的勇气。",
    favoriteCount: "6.7 万",
    commentCount: "3.0 万",
    likeCount: "13.3 万",
    shareCount: "8,924",
    tone: "rose" as const
  },
  {
    id: "starlight-home",
    dramaTitle: "归途有星光",
    episodeLabel: "第 03 集 · 灯塔还亮着",
    description: "她回到海边故乡，才发现有些约定从未被潮水带走。",
    favoriteCount: "4.1 万",
    commentCount: "2,184",
    likeCount: "11.2 万",
    shareCount: "5,017",
    tone: "mist" as const
  },
  {
    id: "beyond-contract",
    dramaTitle: "合约之外",
    episodeLabel: "第 05 集 · 原则松动",
    description: "临时合约本该冷静收场，两个人却开始重新理解彼此。",
    favoriteCount: "5.4 万",
    commentCount: "4,872",
    likeCount: "8.8 万",
    shareCount: "2,640",
    tone: "rose" as const
  },
  {
    id: "letters-home",
    dramaTitle: "山河来信",
    episodeLabel: "第 02 集 · 祖父的地图",
    description: "年轻摄影师沿着旧信出发，把被时光藏起的故事重新拍下来。",
    favoriteCount: "3.3 万",
    commentCount: "1,908",
    likeCount: "7.4 万",
    shareCount: "1,882",
    tone: "mist" as const
  },
  {
    id: "invite-her-in",
    dramaTitle: "引她入室",
    episodeLabel: "第 12 集 · 门后有光",
    description: "她踏进那扇门时并不知道，自己会改写整座宅邸的命运。",
    favoriteCount: "9.2 万",
    commentCount: "6,441",
    likeCount: "18.5 万",
    shareCount: "7,203",
    tone: "rose" as const
  },
  {
    id: "secret-garden",
    dramaTitle: "她的秘密花园",
    episodeLabel: "第 07 集 · 逆袭的种子",
    description: "旧事被翻开的那一夜，她决定不再替任何人沉默。",
    favoriteCount: "7.6 万",
    commentCount: "5,210",
    likeCount: "14.1 万",
    shareCount: "4,558",
    tone: "mist" as const
  },
  {
    id: "dragon-returns",
    dramaTitle: "龙王归来",
    episodeLabel: "第 04 集 · 当众打脸",
    description: "被轻视的人重新站回牌桌，这一次谁也别想再压他一头。",
    favoriteCount: "12.0 万",
    commentCount: "8,903",
    likeCount: "21.6 万",
    shareCount: "9,774",
    tone: "rose" as const
  },
  {
    id: "live-in-son",
    dramaTitle: "上门女婿",
    episodeLabel: "第 09 集 · 身份揭晓",
    description: "低到尘埃里的日子结束了，真正的底牌才刚刚亮出来。",
    favoriteCount: "8.5 万",
    commentCount: "7,116",
    likeCount: "16.9 万",
    shareCount: "6,048",
    tone: "mist" as const
  },
  {
    id: "hidden-healer",
    dramaTitle: "隐世神医",
    episodeLabel: "第 06 集 · 一针定局",
    description: "他本想继续隐姓埋名，直到有人把旧伤重新摆到他面前。",
    favoriteCount: "6.1 万",
    commentCount: "3,774",
    likeCount: "10.8 万",
    shareCount: "3,291",
    tone: "rose" as const
  }
];

const videos: TheaterVideo[] = THEATER_CLIPS.map((clip, index) => ({
  ...clip,
  url: RUNTIME_CONFIG.demoVideoUrls[index] ?? RUNTIME_CONFIG.demoVideoUrl
}));

const ACTION_LABELS: Record<Exclude<TheaterAction, "comment" | "share">, string> = {
  favorite: "已收藏到我的片单",
  like: "已点赞，感谢喜欢"
};

const PULL_REFRESH_THRESHOLD = 96;
const H5_SIMPLIFIED = getClientPlatform() === "h5";

const categories = ["漫画剧", "真人剧", "推荐"];
const activeCategory = ref("推荐");
const currentIndex = ref(0);
const isPulling = ref(false);
const pullDistance = ref(0);
const refreshing = ref(false);
const refreshLabel = ref("下拉刷新内容");
const isFavorite = ref(false);
const isLiked = ref(false);
const commentsOpen = ref(false);
const currentVideo = computed(() => videos[currentIndex.value] ?? videos[0]!);
const videoMarker = computed(
  () => `Mock 视频 ${currentIndex.value + 1} / ${videos.length}`
);
const playbackError = ref("");
const isPlaying = ref(true);
const holdBoosting = ref(false);
const gesture = reactive({ startY: 0, startAt: 0 });
let suppressTap = false;
const layout = reactive({
  pageHeight: 0,
  statusBarHeight: 20,
  capsuleRight: 96,
  overlayTop: 124
});

function measureLayout() {
  try {
    const info = uni.getSystemInfoSync();
    const menu = typeof uni.getMenuButtonBoundingClientRect === "function"
      ? uni.getMenuButtonBoundingClientRect()
      : null;
    layout.pageHeight = info.windowHeight || 667;
    layout.statusBarHeight = info.statusBarHeight || 20;
    layout.capsuleRight = menu ? Math.max(96, info.windowWidth - menu.left + 8) : 96;
    layout.overlayTop = (menu?.bottom || layout.statusBarHeight + 32) + 12;
  } catch {
    layout.pageHeight = 667;
  }
}

measureLayout();
onMounted(() => {
  measureLayout();
});

function selectCategory(category: string) {
  if (!categories.includes(category)) return;
  activeCategory.value = category;
  uni.showToast({ title: `已切换到${category}`, icon: "none" });
}

function openSearch() {
  uni.navigateTo({ url: "/pages/search/index" });
}

function videoId(index: number): string {
  return `theater-video-${index}`;
}

function isMountedSlide(index: number): boolean {
  return Math.abs(index - currentIndex.value) <= 1;
}

function theaterContext(index = currentIndex.value) {
  return uni.createVideoContext(videoId(index));
}

function applyTheaterRate(rate: number) {
  theaterContext().playbackRate(restoreHoldRate(rate));
}

function playCurrent() {
  holdBoosting.value = false;
  isPlaying.value = true;
  applyTheaterRate(1);
  theaterContext().play();
}

function pauseIndex(index: number) {
  try {
    theaterContext(index).pause();
  } catch {
    // slide may be unmounted
  }
}

function startHoldBoost() {
  if (!isPlaying.value || holdBoosting.value || playbackError.value) return;
  suppressTap = true;
  holdBoosting.value = true;
  applyTheaterRate(holdBoostRate());
}

function endHoldBoost() {
  if (!holdBoosting.value) return;
  holdBoosting.value = false;
  applyTheaterRate(1);
  suppressTap = true;
  setTimeout(() => {
    suppressTap = false;
  }, 80);
}

function togglePlayback() {
  if (suppressTap || holdBoosting.value) {
    suppressTap = false;
    return;
  }
  const context = theaterContext();
  if (isPlaying.value) context.pause();
  else context.play();
}

function changeVideo(index: number, notice?: string) {
  const nextIndex = Math.max(0, Math.min(index, videos.length - 1));
  const video = videos[nextIndex];
  if (!video) return;
  if (nextIndex === currentIndex.value && !notice) {
    uni.showToast({ title: nextIndex === 0 ? "已经是第一条" : "已经是最后一条", icon: "none" });
    return;
  }
  pauseIndex(currentIndex.value);
  currentIndex.value = nextIndex;
  isFavorite.value = false;
  isLiked.value = false;
  playbackError.value = "";
  void nextTick(() => playCurrent());
  if (notice) uni.showToast({ title: notice, icon: "none" });
}

function onSwiperChange(event: { detail?: { current?: number } }) {
  const next = Number(event.detail?.current);
  if (!Number.isFinite(next) || next === currentIndex.value) return;
  pauseIndex(currentIndex.value);
  currentIndex.value = next;
  isFavorite.value = false;
  isLiked.value = false;
  holdBoosting.value = false;
  applyTheaterRate(1);
}

function onSwiperFinish() {
  playCurrent();
}

function onFirstTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch || refreshing.value || currentIndex.value !== 0) return;
  gesture.startY = touch.clientY;
  gesture.startAt = Date.now();
}

function onFirstTouchMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch || refreshing.value || currentIndex.value !== 0) return;
  const distance = touch.clientY - gesture.startY;
  if (distance <= 0) {
    isPulling.value = false;
    pullDistance.value = 0;
    return;
  }
  pullDistance.value = Math.min(124, Math.round(distance * 0.48));
  isPulling.value = true;
  refreshLabel.value = pullDistance.value >= PULL_REFRESH_THRESHOLD ? "松开刷新内容" : "下拉刷新内容";
}

function onSlideTouchEnd(event: TouchEvent) {
  endHoldBoost();
  if (currentIndex.value !== 0 || refreshing.value) return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  const distance = touch.clientY - gesture.startY;
  if (distance >= PULL_REFRESH_THRESHOLD) {
    void refreshFirstVideo();
    return;
  }
  isPulling.value = false;
  pullDistance.value = 0;
  refreshLabel.value = "下拉刷新内容";
}

async function refreshFirstVideo() {
  isPulling.value = false;
  pullDistance.value = PULL_REFRESH_THRESHOLD;
  refreshing.value = true;
  refreshLabel.value = "正在刷新内容…";
  await new Promise<void>((resolve) => setTimeout(resolve, 700));
  changeVideo(1, "已为你刷新一条新短剧");
  refreshing.value = false;
  pullDistance.value = 0;
  refreshLabel.value = "下拉刷新内容";
}

function handleAction(action: TheaterAction) {
  if (action === "comment") {
    commentsOpen.value = true;
    return;
  }
  if (action === "share") {
    shareIfExternallyAllowed(
      shareDramaText(currentVideo.value.dramaTitle, currentVideo.value.episodeLabel),
      false
    );
    return;
  }
  if (action === "favorite") isFavorite.value = !isFavorite.value;
  if (action === "like") isLiked.value = !isLiked.value;
  if (action in ACTION_LABELS) uni.showToast({ title: ACTION_LABELS[action as keyof typeof ACTION_LABELS], icon: "none" });
}

function onTheaterPause() {
  isPlaying.value = false;
  endHoldBoost();
}

function onSlideReady(index: number) {
  if (index === currentIndex.value) playCurrent();
}

function onVideoError() {
  playbackError.value =
    "试播视频未加载。请启动 npm run dev:admin，并在微信开发者工具勾选不校验合法域名。成片文件在 apps/admin/public/demo/，不在小程序包内。";
}

function nextSimple() {
  changeVideo(currentIndex.value + 1);
}

function prevSimple() {
  changeVideo(currentIndex.value - 1);
}
</script>

<template>
  <view class="theater-page">
    <view class="theater-fallback" :class="`poster-${currentVideo.tone}`">
      <view class="fallback-title">{{ currentVideo.dramaTitle }}</view>
      <view class="fallback-copy">{{ playbackError || "正在加载本地试播视频…" }}</view>
    </view>
    <swiper
      v-if="!playbackError"
      class="theater-swiper"
      vertical
      :circular="false"
      :current="currentIndex"
      :duration="280"
      :aria-label="`${currentVideo.dramaTitle}沉浸式短剧播放器`"
      @change="onSwiperChange"
      @animationfinish="onSwiperFinish"
    >
      <swiper-item v-for="(item, index) in videos" :key="item.id">
        <view class="slide" :class="`poster-${item.tone}`">
          <video
            v-if="isMountedSlide(index)"
            :id="videoId(index)"
            class="theater-video"
            :src="item.url"
            :autoplay="index === currentIndex"
            loop
            :muted="H5_SIMPLIFIED"
            :obey-mute-switch="false"
            :controls="false"
            :show-center-play-btn="false"
            :enable-progress-gesture="false"
            object-fit="cover"
            :aria-label="item.dramaTitle"
            @play="isPlaying = true"
            @pause="onTheaterPause"
            @loadedmetadata="onSlideReady(index)"
            @error="onVideoError"
          />
          <view class="video-shade" />
          <view
            class="hit-layer"
            @tap="togglePlayback"
            @longpress="startHoldBoost"
            @touchstart="index === 0 ? onFirstTouchStart($event) : undefined"
            @touchmove="index === 0 ? onFirstTouchMove($event) : undefined"
            @touchend="onSlideTouchEnd"
            @touchcancel="endHoldBoost"
          />
        </view>
      </swiper-item>
    </swiper>
      <image v-if="!isPlaying && !playbackError" class="pause-mark" :src="ACTION_ICONS.pause" mode="aspectFit" aria-hidden="true" />
    <view v-else-if="holdBoosting" class="boost-mark" aria-live="polite">{{ holdBoostRate() }}x</view>

    <view
      class="refresh-panel"
      :class="{ visible: isPulling || refreshing }"
      :style="{ transform: `translateY(${pullDistance}px)` }"
    >
      <view class="refresh-spinner" :class="{ spinning: refreshing }">↻</view>
      <view>{{ refreshLabel }}</view>
    </view>

    <view
      class="topbar"
      :style="{
        paddingTop: `${layout.statusBarHeight + 8}px`,
        paddingRight: `${layout.capsuleRight}px`
      }"
    >
      <view class="categories" role="tablist" aria-label="短剧分类">
        <button
          v-for="item in categories"
          :key="item"
          class="category"
          :class="{ active: activeCategory === item }"
          role="tab"
          :aria-selected="activeCategory === item"
          @tap="selectCategory(item)"
        >
          {{ item }}
        </button>
      </view>
      <button class="search-button" aria-label="搜索短剧" @tap="openSearch">
        <image class="search-icon" :src="NAV_ICONS.search" mode="aspectFit" aria-hidden="true" />
      </button>
    </view>

    <view class="video-marker" :style="{ top: `${layout.overlayTop}px` }">
      {{ videoMarker }}
    </view>
    <view class="swipe-tip" :style="{ top: `${layout.overlayTop + 22}px` }">
      {{ H5_SIMPLIFIED ? "轻点暂停 · 长按加速 · 用按钮切换条目" : "轻点暂停 · 长按加速 · 上下滑切换拼接条目" }}
    </view>
    <view v-if="H5_SIMPLIFIED" class="h5-switchers">
      <button class="secondary-button" @tap="prevSimple">上一条</button>
      <button class="secondary-button" @tap="nextSimple">下一条</button>
    </view>

    <view class="content">
      <view class="story">
        <view class="episode-label">{{ currentVideo.episodeLabel }}</view>
        <view class="drama-title">{{ currentVideo.dramaTitle }}</view>
        <view class="description">{{ currentVideo.description }}</view>
        <view class="full-drama"><image :src="ACTION_ICONS.play" mode="aspectFit" aria-hidden="true" />观看完整短剧 · 全集更新中 <image :src="NAV_ICONS.arrowRight" mode="aspectFit" aria-hidden="true" /></view>
      </view>
      <view class="side-actions">
        <PlayerActions
          :favorited="isFavorite"
          :liked="isLiked"
          :favorite-label="currentVideo.favoriteCount"
          :comment-label="currentVideo.commentCount"
          :like-label="currentVideo.likeCount"
          :share-label="currentVideo.shareCount"
          @favorite="handleAction('favorite')"
          @comment="handleAction('comment')"
          @like="handleAction('like')"
          @share="handleAction('share')"
        />
      </view>
    </view>
    <CommentSheet
      :visible="commentsOpen"
      :drama-title="currentVideo.dramaTitle"
      @close="commentsOpen = false"
    />
  </view>
</template>

<style>
page {
  height: 100%;
  overflow: hidden;
  color: #fff;
  background: #08080a;
}
</style>
<style scoped src="../../styles/theater.scss"></style>
<style scoped>
.h5-switchers {
  position: absolute;
  right: 24rpx;
  bottom: 280rpx;
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
</style>
