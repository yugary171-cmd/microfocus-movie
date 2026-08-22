<script setup lang="ts">
import type { DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi, isMockMode } from "@/shared/api";
import { resolveDirectPlaybackUrl } from "@/features/catalog";
import { toFriendlyErrorMessage } from "@/shared/utils";

const NEW_DRAMA_WINDOW_DAYS = 20;
const publishedAfter = new Date(Date.now() - NEW_DRAMA_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
type GenderOption = "全部性别" | "男生" | "女生";

const items = ref<DramaCard[]>([]);
const page = ref(0);
const hasMore = ref(true);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const openingId = ref("");
const activeGender = ref<GenderOption>("全部性别");
const genderOptions: GenderOption[] = ["全部性别", "男生", "女生"];
const navInsetTop = ref(52);

function measureNavInset() {
  try {
    const info = uni.getSystemInfoSync();
    const statusBar = Number(info.statusBarHeight) || 20;
    const menu = typeof uni.getMenuButtonBoundingClientRect === "function"
      ? uni.getMenuButtonBoundingClientRect()
      : null;
    const menuBottom = Number(menu?.bottom);
    navInsetTop.value = (Number.isFinite(menuBottom) && menuBottom > 0 ? menuBottom : statusBar + 32) + 8;
  } catch {
    navInsetTop.value = 52;
  }
}

function activeGenderTag(): string {
  if (activeGender.value === "男生") return "男频";
  if (activeGender.value === "女生") return "女频";
  return "";
}

function posterTone(index: number): string {
  return ["poster-mist", "poster-rose", "poster-gold", "poster-jade", "poster-violet", "poster-night"][index % 6] || "poster-mist";
}

function badge(item: DramaCard): string {
  return item.publishedAt && Date.parse(item.publishedAt) >= Date.now() - 24 * 60 * 60 * 1000 ? "今日上新" : "新剧";
}

async function loadMore(reset = false) {
  if (reset) {
    page.value = 0;
    hasMore.value = true;
    items.value = [];
    loading.value = true;
    error.value = "";
  } else if (loadingMore.value || !hasMore.value) {
    return;
  }
  const nextPage = page.value + 1;
  if (nextPage > 1) loadingMore.value = true;
  try {
    const genderTag = activeGenderTag();
    const response = await getApi().search("", "", nextPage, {
      publishedAfter,
      ...(genderTag ? { tags: [genderTag] } : {})
    });
    const nextItems = Array.isArray(response.items) ? response.items : [];
    items.value = reset ? nextItems : [...items.value, ...nextItems];
    page.value = response.page || nextPage;
    hasMore.value = Boolean(response.hasMore) && nextItems.length > 0;
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    if (reset) items.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function goBack() {
  uni.navigateBack();
}

function selectGender(option: GenderOption) {
  if (activeGender.value === option) return;
  activeGender.value = option;
  void loadMore(true);
}

async function openDrama(item: DramaCard) {
  if (!item.id || openingId.value) return;
  openingId.value = item.id;
  try {
    uni.navigateTo({ url: await resolveDirectPlaybackUrl(item.id) });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  } finally {
    openingId.value = "";
  }
}

onLoad(() => {
  measureNavInset();
  void loadMore(true);
});
onReachBottom(() => { void loadMore(); });
</script>

<template>
  <view class="new-drama-page">
    <view class="new-drama-header" :style="{ paddingTop: `${navInsetTop}px` }">
      <button class="back-button" aria-label="返回" @tap="goBack">‹</button>
      <text class="page-title">新剧推荐</text>
      <view class="header-spacer" />
    </view>
    <view class="gender-tabs" aria-label="性别筛选">
      <button
        v-for="option in genderOptions"
        :key="option"
        class="gender-tab"
        :class="{ active: activeGender === option }"
        @tap="selectGender(option)"
      >{{ option }}</button>
    </view>
    <view v-if="isMockMode()" class="mock-note">内部体验 · 最近 20 天内上架的 Mock 剧目</view>
    <view v-if="loading" class="feed-state">正在加载新剧…</view>
    <view v-else-if="error" class="feed-state" role="alert">{{ error }}</view>
    <view v-else-if="!items.length" class="feed-state">最近 20 天暂无新剧</view>
    <view v-else class="new-drama-grid" aria-label="新剧推荐列表">
      <button v-for="(item, index) in items" :key="item.id" class="new-drama-card" :aria-label="`查看 ${item.title}`" @tap="openDrama(item)">
        <view class="new-poster" :class="posterTone(index)">
          <image v-if="item.coverUrl && !isMockMode()" class="poster-image" :src="item.coverUrl" mode="aspectFill" lazy-load :aria-label="`${item.title}海报`" />
          <view v-else class="poster-placeholder"><text>{{ item.title }}</text></view>
          <text class="new-badge">{{ badge(item) }}</text>
        </view>
        <text class="new-title">{{ item.title }}</text>
        <text class="new-meta">{{ badge(item) }} · {{ item.category || "短剧" }}</text>
      </button>
    </view>
    <view v-if="loadingMore" class="feed-state">正在加载更多…</view>
    <view v-else-if="hasMore && items.length" class="feed-state">继续上滑加载</view>
    <view v-else-if="items.length" class="feed-state">已加载全部新剧</view>
  </view>
</template>

<style>
page { background: #f7f7f8; color: #19191d; }
</style>
<style scoped src="../../styles/new-drama.scss"></style>
