<script setup lang="ts">
import { SEARCH_PAGE_SIZE, type DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { getApi } from "../../services/api";
import { NAV_ICONS } from "../../constants/icons";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { resolveDirectPlaybackUrl } from "../../utils/direct-playback";
import {
  DEFAULT_DISCOVER_FILTERS,
  rankingHeatLabel,
  sortDiscoverItems,
  visibleDiscoverSections,
  type DiscoverFilterKey
} from "../../utils/discover";

const results = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const filtersExpanded = ref(true);
const selectedFilters = ref({ ...DEFAULT_DISCOVER_FILTERS });
const visibleSections = computed(() => visibleDiscoverSections(filtersExpanded.value));
const navInsetTop = ref(52);
const openingDramaId = ref("");

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

async function search(reset: boolean) {
  if (loadingMore.value) return;
  const nextPage = reset ? 1 : page.value + 1;
  if (reset) {
    loading.value = true;
    error.value = "";
  } else {
    if (!hasMore.value) return;
    loadingMore.value = true;
  }
  try {
    const format = selectedFilters.value.format;
    const response = await getApi().search(
      "",
      format === "全部体裁" ? "" : format,
      nextPage,
      {
        subject: selectedFilters.value.subject === "全部主题" ? "" : selectedFilters.value.subject,
        setting: selectedFilters.value.setting === "全部设定" ? "" : selectedFilters.value.setting,
        background: selectedFilters.value.background === "全部背景" ? "" : selectedFilters.value.background
      }
    );
    const nextItems = Array.isArray(response.items) ? response.items : [];
    const combined = reset ? nextItems : results.value.concat(nextItems);
    results.value = sortDiscoverItems(combined, selectedFilters.value.recommendation);
    page.value = response.page || nextPage;
    hasMore.value = Boolean(response.hasMore);
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    if (reset) results.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

function selectFilter(key: DiscoverFilterKey, value: string) {
  selectedFilters.value = { ...selectedFilters.value, [key]: value };
  void search(true);
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
  void search(true);
});

onReachBottom(() => {
  if (hasMore.value && !loading.value) void search(false);
});
</script>

<template>
  <view class="filter-page">
    <view class="filter-header" :style="{ paddingTop: `${navInsetTop}px` }">
      <view class="back" @tap="goBack">‹</view>
      <view class="page-title">筛选</view>
    </view>

    <view class="filter-panel">
      <view
        v-for="section in visibleSections"
        :key="section.key"
        class="filter-row"
      >
        <button class="filter-all" :class="{ active: selectedFilters[section.key] === section.all }" @tap="selectFilter(section.key, section.all)">{{ section.all }}</button>
        <scroll-view class="filter-options-row" scroll-x :show-scrollbar="false">
          <view class="filter-row-inner">
            <button
              v-for="option in section.choices"
              :key="option"
              class="filter-chip"
              :class="{ active: selectedFilters[section.key] === option }"
              @tap="selectFilter(section.key, option)"
            >
              {{ option }}
            </button>
          </view>
        </scroll-view>
      </view>
      <button class="collapse-button" @tap="filtersExpanded = !filtersExpanded">
        <text>{{ filtersExpanded ? "收起" : "展开" }}</text>
      <image class="collapse-icon" :class="{ expanded: filtersExpanded }" :src="NAV_ICONS.arrowDown" mode="aspectFit" aria-hidden="true" />
      </button>
    </view>

    <view v-if="loading" class="filter-state">正在加载短剧…</view>
    <view v-else-if="error" class="filter-state" role="alert">{{ error }}</view>
    <view v-else-if="!results.length" class="filter-state">没有符合筛选条件的短剧</view>
    <view v-else class="filter-grid">
      <button
        v-for="item in results"
        :key="item.id"
        class="filter-card"
        @tap="openDrama(item.id)"
      >
        <view class="filter-poster">{{ item.title.slice(0, 1) }}</view>
        <view class="filter-title">{{ item.title }}</view>
        <view class="filter-meta">热度 {{ rankingHeatLabel(item.recommendationRank) }} · {{ item.tags[0] || item.category }}</view>
      </button>
    </view>
    <view v-if="loadingMore" class="filter-state">正在加载更多…</view>
    <view v-else-if="hasMore" class="filter-state">上滑加载更多</view>
    <view v-else-if="results.length >= SEARCH_PAGE_SIZE" class="filter-state">已经到底了</view>
  </view>
</template>

<style>
page {
  background: #fff;
  color: #17171b;
}
</style>
<style scoped src="../../styles/category.scss"></style>
