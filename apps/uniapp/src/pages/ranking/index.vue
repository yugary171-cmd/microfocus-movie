<script setup lang="ts">
import type { DramaCard, HomeFilterOptions } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { getApi } from "../../services/api";
import { NAV_ICONS } from "../../constants/icons";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { resolveDirectPlaybackUrl } from "../../utils/direct-playback";
import {
  RANKING_TABS,
  RANKING_TYPES,
  rankingHeatLabel,
  rankingUpdatedCopy,
  sortRankingItems
} from "../../utils/discover";

const emptyFilters = { subject: "", setting: "", background: "" };
const tabs = RANKING_TABS;
const rankingTypes = RANKING_TYPES;
const activeTab = ref<(typeof RANKING_TABS)[number]>("全部");
const activeRanking = ref<(typeof RANKING_TYPES)[number]>("推荐榜");
const filterOptions = ref<HomeFilterOptions>({ subjects: [], settings: [], backgrounds: [] });
const draftDrawer = ref({ ...emptyFilters });
const appliedDrawer = ref({ ...emptyFilters });
const drawerOpen = ref(false);
const items = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const updatedCopy = rankingUpdatedCopy();
const navInsetTop = ref(52);
const openingDramaId = ref("");
const rankedItems = computed(() => sortRankingItems(items.value, activeRanking.value));
const drawerSections = computed(() => [
  { key: "subject" as const, title: "全部主题", values: Array.isArray(filterOptions.value.subjects) ? filterOptions.value.subjects : [] },
  { key: "setting" as const, title: "全部设定", values: Array.isArray(filterOptions.value.settings) ? filterOptions.value.settings : [] },
  { key: "background" as const, title: "全部背景", values: Array.isArray(filterOptions.value.backgrounds) ? filterOptions.value.backgrounds : [] }
]);

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

async function load(reset = true) {
  if (loadingMore.value) return;
  const next = reset ? 1 : page.value + 1;
  if (reset) {
    loading.value = true;
    error.value = "";
  } else {
    if (!hasMore.value) return;
    loadingMore.value = true;
  }
  try {
    const result = await getApi().search(
      "",
      activeTab.value === "全部" ? "" : activeTab.value,
      next,
      appliedDrawer.value
    );
    const nextItems = Array.isArray(result.items) ? result.items : [];
    items.value = reset ? nextItems : items.value.concat(nextItems);
    page.value = result.page || next;
    hasMore.value = Boolean(result.hasMore);
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    if (reset) items.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function selectTab(tab: (typeof RANKING_TABS)[number]) {
  activeTab.value = tab;
  appliedDrawer.value = { ...emptyFilters };
  draftDrawer.value = { ...emptyFilters };
  void load();
}

function selectRanking(type: (typeof RANKING_TYPES)[number]) {
  activeRanking.value = type;
}

function openDrawer() {
  draftDrawer.value = { ...appliedDrawer.value };
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
}

function clearDrawer() {
  draftDrawer.value = { ...emptyFilters };
}

function confirmDrawer() {
  appliedDrawer.value = { ...draftDrawer.value };
  drawerOpen.value = false;
  void load();
}

function selectDrawerOption(key: "subject" | "setting" | "background", value: string) {
  draftDrawer.value = { ...draftDrawer.value, [key]: draftDrawer.value[key] === value ? "" : value };
}

async function openDrama(id: string) {
  if (!id || openingDramaId.value) return;
  openingDramaId.value = id;
  try {
    uni.navigateTo({ url: await resolveDirectPlaybackUrl(id) });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  } finally {
    openingDramaId.value = "";
  }
}

function goBack() {
  uni.navigateBack();
}

onLoad(() => {
  measureNavInset();
  void (async () => {
    try {
      const catalog = await getApi().getCatalog();
      filterOptions.value = catalog.filterOptions || { subjects: [], settings: [], backgrounds: [] };
    } catch {
      filterOptions.value = { subjects: [], settings: [], backgrounds: [] };
    }
    await load();
  })();
});
onReachBottom(() => {
  if (hasMore.value && !loading.value) void load(false);
});
</script>

<template>
  <view class="ranking-page">
    <view class="ranking-hero" :style="{ paddingTop: `${navInsetTop}px` }">
      <view class="hero-deco" aria-hidden="true" />
      <view class="hero-bar">
        <view class="back" @tap="goBack">‹</view>
      </view>
      <view class="hero-title">《微焦{{ activeRanking }}》</view>
      <view class="hero-subtitle">{{ updatedCopy }}</view>
    </view>

    <view class="ranking-body">
      <scroll-view class="ranking-tabs" scroll-x :show-scrollbar="false" aria-label="剧目分类">
        <view class="ranking-tabs-inner">
          <view
            v-for="tab in tabs"
            :key="tab"
            class="ranking-tab"
            :class="{ active: activeTab === tab }"
            @tap="selectTab(tab)"
          >
            {{ tab }}
          </view>
        </view>
      </scroll-view>

      <view class="ranking-tools">
        <view class="ranking-types-wrap">
          <scroll-view class="ranking-types" scroll-x :show-scrollbar="false" aria-label="榜单类型">
            <view class="ranking-types-inner">
              <view
                v-for="type in rankingTypes"
                :key="type"
                class="ranking-type"
                :class="{ active: activeRanking === type }"
                @tap="selectRanking(type)"
              >
                {{ type }}
              </view>
            </view>
          </scroll-view>
        </view>
        <button class="ranking-filter" hover-class="none" @tap.stop="openDrawer">
          <text>分类</text>
          <image class="chevron-down" :src="NAV_ICONS.arrowDown" mode="aspectFit" aria-hidden="true" />
        </button>
      </view>

      <view v-if="loading" class="ranking-state">正在加载榜单…</view>
      <view v-else-if="error" class="ranking-state" role="alert">{{ error }}</view>
      <view v-else-if="!rankedItems.length" class="ranking-state">暂无榜单内容</view>
      <view v-else class="ranking-list">
        <view
          v-for="(item, index) in rankedItems"
          :key="item.id"
          class="ranking-item"
          @tap="openDrama(item.id)"
        >
          <view class="rank-poster">
            <view class="rank-badge" :class="`rank-${Math.min(index, 3)}`">{{ index + 1 }}</view>
            <text>{{ item.title.slice(0, 1) }}</text>
          </view>
          <view class="rank-copy">
            <view class="rank-head">
              <text class="rank-title">{{ item.title }}</text>
              <text class="rank-hot">热度 {{ rankingHeatLabel(item.recommendationRank) }} 推荐</text>
            </view>
            <text class="rank-meta">{{ item.category }} · 全 {{ item.episodeCount }} 集</text>
            <text class="rank-summary">{{ item.summary }}</text>
          </view>
        </view>
        <view v-if="loadingMore" class="ranking-state">正在加载更多…</view>
        <view v-else-if="hasMore" class="ranking-state">上滑加载更多</view>
      </view>
    </view>

    <view v-if="drawerOpen" class="drawer-mask" @tap="closeDrawer">
      <view class="filter-drawer" @tap.stop>
        <view class="drawer-header">
          <button class="drawer-close" aria-label="关闭筛选" @tap="closeDrawer"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></button>
          <text>筛选</text>
          <view class="drawer-spacer" />
        </view>
        <scroll-view class="drawer-content" scroll-y :show-scrollbar="false">
          <view v-for="section in drawerSections" :key="section.key" class="drawer-section">
            <text class="drawer-title">{{ section.title }}</text>
            <view class="drawer-options">
              <view
                v-for="value in section.values"
                :key="value"
                class="drawer-option"
                :class="{ selected: draftDrawer[section.key] === value }"
                @tap="selectDrawerOption(section.key, value)"
              >
                {{ value }}
              </view>
            </view>
          </view>
        </scroll-view>
        <view class="drawer-footer">
          <view class="drawer-clear" @tap="clearDrawer">清空</view>
          <view class="drawer-confirm" @tap="confirmDrawer">确定</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #cfe98a;
  color: #17171b;
}
</style>
<style scoped src="../../styles/ranking.scss"></style>
