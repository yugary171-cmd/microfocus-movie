<script setup lang="ts">
import type { DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi } from "../../services/api";

const tabs = ["全部", "真人剧", "漫剧", "AI 剧"];
const rankingTypes = ["推荐榜", "热播榜", "热搜榜", "收藏榜"];
const activeTab = ref("全部");
const activeRanking = ref("推荐榜");
const drawerOpen = ref(false);
const items = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);

async function load(reset = true) {
  if (loadingMore.value) return;
  const next = reset ? 1 : page.value + 1;
  if (reset) loading.value = true;
  else loadingMore.value = true;
  try {
    const result = await getApi().search("", activeTab.value === "全部" ? "" : activeTab.value, next);
    items.value = reset ? result.items : [...items.value, ...result.items];
    page.value = result.page || next;
    hasMore.value = Boolean(result.hasMore);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function selectTab(tab: string) { activeTab.value = tab; void load(); }
function selectRanking(type: string) { activeRanking.value = type; drawerOpen.value = false; void load(); }
function openDrama(id: string) { uni.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` }); }
function goBack() { uni.navigateBack(); }
onLoad(() => void load());
onReachBottom(() => { if (hasMore.value) void load(false); });
</script>

<template>
  <view class="ranking-page">
    <view class="ranking-hero">
      <view class="back" @tap="goBack">‹</view>
      <view class="hero-title">✿ 推荐榜 ✿</view>
      <view class="hero-subtitle">今日更新 · 基于观看、互动以及个人兴趣排序</view>
    </view>
    <view class="ranking-panel">
      <scroll-view class="ranking-tabs" scroll-x enable-flex aria-label="剧目分类">
        <button v-for="tab in tabs" :key="tab" class="ranking-tab" :class="{ active: activeTab === tab }" @tap="selectTab(tab)">{{ tab }}</button>
      </scroll-view>
      <view class="ranking-tools">
        <scroll-view class="ranking-types" scroll-x enable-flex aria-label="榜单类型">
          <button v-for="type in rankingTypes" :key="type" class="ranking-type" :class="{ active: activeRanking === type }" @tap="selectRanking(type)">{{ type }}</button>
        </scroll-view>
        <button class="ranking-filter" @tap="drawerOpen = true">分类⌄</button>
      </view>
      <view v-if="loading" class="ranking-state">正在加载榜单…</view>
      <view v-else-if="!items.length" class="ranking-state">暂无榜单内容</view>
      <view v-else class="ranking-list">
        <button v-for="(item, index) in items" :key="item.id" class="ranking-item" @tap="openDrama(item.id)">
          <view class="rank-number">{{ index + 1 }}</view>
          <view class="rank-poster">{{ item.title.slice(0, 1) }}</view>
          <view class="rank-copy"><text class="rank-title">{{ item.title }}</text><text class="rank-meta">{{ item.category }} · 全 {{ item.episodeCount }} 集</text><text class="rank-summary">{{ item.summary }}</text><text class="rank-hot">🔥 {{ (item.recommendationRank || 0) * 10 }}万推荐</text></view>
        </button>
        <view v-if="loadingMore" class="ranking-state">正在加载更多…</view>
      </view>
    </view>
    <view v-if="drawerOpen" class="rank-drawer-mask" @tap="drawerOpen = false"><view class="rank-drawer" @tap.stop><view class="rank-drawer-title">榜单分类</view><button v-for="type in rankingTypes" :key="type" class="rank-drawer-option" :class="{ active: activeRanking === type }" @tap="selectRanking(type)">{{ type }}</button></view></view>
  </view>
</template>

<style scoped>
page { background: #effcf9; }
.ranking-page { min-height: 100vh; color: #17171b; background: #effcf9; }
.ranking-hero { padding: calc(30rpx + env(safe-area-inset-top)) 36rpx 34rpx; background: linear-gradient(135deg, #52dcb0, #c3f5cf); }
.back { font-size: 70rpx; line-height: 60rpx; }
.hero-title { margin-top: 24rpx; font-size: 44rpx; font-weight: 850; }.hero-subtitle { margin-top: 12rpx; color: #458b78; font-size: 22rpx; }
.ranking-panel { margin-top: -2rpx; padding: 28rpx 36rpx; background: #fff; border-radius: 32rpx 32rpx 0 0; }
.ranking-tabs, .ranking-types { white-space: nowrap; }.ranking-tabs { margin-bottom: 22rpx; }.ranking-tabs, .ranking-tools { display: flex; align-items: center; }.ranking-tab { flex: none; margin: 0 30rpx 0 0; padding: 0; color: #999; background: transparent; font-size: 32rpx; }.ranking-tab.active { color: #151519; font-weight: 800; }
.ranking-tools { gap: 14rpx; }.ranking-types { flex: 1; min-width: 0; }.ranking-type { flex: none; margin: 0 12rpx 0 0; padding: 16rpx 28rpx; color: #555; background: #f6f6f7; border-radius: 14rpx; font-size: 25rpx; }.ranking-type.active { color: #e7832b; background: #fff0df; }
.ranking-filter { flex: none; margin: 0; padding: 16rpx 0 16rpx 12rpx; color: #222; background: transparent; font-size: 25rpx; }
.ranking-list { margin-top: 28rpx; }.ranking-item { display: flex; align-items: center; width: 100%; margin: 0 0 28rpx; padding: 0; text-align: left; background: transparent; }.rank-number { width: 42rpx; color: #ef8a2e; font-size: 28rpx; font-weight: 800; }.rank-poster { display: flex; align-items: center; justify-content: center; width: 150rpx; height: 190rpx; color: #fff; background: linear-gradient(145deg, #5b8db8, #a54f5a); border-radius: 16rpx; font-size: 60rpx; font-weight: 850; }.rank-copy { flex: 1; min-width: 0; margin-left: 22rpx; }.rank-title, .rank-meta, .rank-summary, .rank-hot { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.rank-title { font-size: 30rpx; font-weight: 750; }.rank-meta, .rank-summary { margin-top: 12rpx; color: #999; font-size: 23rpx; }.rank-hot { margin-top: 18rpx; color: #ed832a; font-size: 23rpx; }.ranking-state { padding: 40rpx 0; color: #999; text-align: center; }
.rank-drawer-mask { position: fixed; z-index: 30; inset: 0; background: rgba(0,0,0,.42); }.rank-drawer { position: absolute; right: 0; bottom: 0; left: 0; padding: 36rpx; background: #fff; border-radius: 28rpx 28rpx 0 0; }.rank-drawer-title { margin-bottom: 24rpx; font-size: 32rpx; font-weight: 800; }.rank-drawer-option { display: inline-block; margin: 0 16rpx 16rpx 0; padding: 18rpx 28rpx; color: #555; background: #f5f5f6; border-radius: 14rpx; font-size: 25rpx; }.rank-drawer-option.active { color: #e7832b; background: #fff0df; }
</style>
