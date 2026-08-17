<script setup lang="ts">
import type { DramaCard, HomeFilterOptions } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { HOME_PRIMARY_CHANNELS, HOME_RECOMMEND_CHANNEL } from "../../constants/runtime";
import { NAV_ICONS } from "../../constants/icons";
import { getApi, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { buildHomeChannels, searchCategoryParam } from "../../utils/home-channels";

type PosterTone = "mist" | "rose" | "gold" | "jade" | "violet" | "night";
type HomeDrama = {
  id: string;
  title: string;
  subtitle: string;
  ranking: string;
  tone: PosterTone;
};

const TONES: PosterTone[] = ["mist", "rose", "gold", "jade", "violet", "night"];

function toHomeDrama(card: DramaCard, index: number): HomeDrama {
  return {
    id: card.id,
    title: card.title || "未命名短剧",
    subtitle: `${card.category || "短剧"} · 全 ${Math.max(0, card.episodeCount || 0)} 集`,
    ranking: Array.isArray(card.tags) && card.tags[0] ? card.tags[0] : card.category || "短剧",
    tone: TONES[index % TONES.length] || "mist"
  };
}

const isMock = isMockMode();
const categories = ref<string[]>(buildHomeChannels([]));
const activeCategory = ref(HOME_RECOMMEND_CHANNEL);
const filterOptions = ref<HomeFilterOptions>({ subjects: [], settings: [], backgrounds: [] });
const selectedTags = ref<string[]>([]);
const draftDrawer = ref({ subject: "", setting: "", background: "" });
const appliedDrawer = ref({ subject: "", setting: "", background: "" });
const drawerOpen = ref(false);
const subTags = ref<string[]>([]);
const drawerSections = computed(() => [
  { key: "subject" as const, title: "全部主题", values: filterOptions.value.subjects },
  { key: "setting" as const, title: "全部设定", values: filterOptions.value.settings },
  { key: "background" as const, title: "全部背景", values: filterOptions.value.backgrounds }
]);
const dramas = ref<HomeDrama[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");

async function loadFeed(reset: boolean) {
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
    const response = await getApi().search(
      "",
      searchCategoryParam(activeCategory.value),
      nextPage,
      { tags: selectedTags.value, ...appliedDrawer.value }
    );
    const mapped = (Array.isArray(response.items) ? response.items : []).map((item, index) =>
      toHomeDrama(item, (reset ? 0 : dramas.value.length) + index)
    );
    dramas.value = reset ? mapped : [...dramas.value, ...mapped];
    page.value = response.page || nextPage;
    hasMore.value = Boolean(response.hasMore);
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    if (reset) dramas.value = [];
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onLoad(() => {
  void (async () => {
    try {
      const catalog = await getApi().getCatalog();
      categories.value = buildHomeChannels(catalog.categories);
      filterOptions.value = catalog.filterOptions || { subjects: [], settings: [], backgrounds: [] };
      subTags.value = filterOptions.value.subjects;
    } catch {
      categories.value = buildHomeChannels([]);
    }
    await loadFeed(true);
  })();
});

onReachBottom(() => {
  if (hasMore.value && !loading.value) void loadFeed(false);
});

function openSearch() {
  uni.navigateTo({ url: "/pages/search/index" });
}

function openFilterPage() {
  uni.navigateTo({ url: "/pages/category/index" });
}

function openRankingPage() {
  uni.navigateTo({ url: "/pages/ranking/index" });
}

function openNewDrama() {
  uni.navigateTo({ url: "/pages/search/index" });
}

function selectCategory(category: string) {
  if (!category || category === activeCategory.value) return;
  activeCategory.value = category;
  selectedTags.value = [];
  appliedDrawer.value = { subject: "", setting: "", background: "" };
  draftDrawer.value = { subject: "", setting: "", background: "" };
  subTags.value = category === HOME_RECOMMEND_CHANNEL ? [] : filterOptions.value.subjects;
  void loadFeed(true);
}

function toggleTag(tag: string) {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((item) => item !== tag)
    : [...selectedTags.value, tag];
  void loadFeed(true);
}

function openDrawer() {
  draftDrawer.value = { ...appliedDrawer.value };
  drawerOpen.value = true;
}

function clearDrawer() {
  selectedTags.value = [];
  draftDrawer.value = { subject: "", setting: "", background: "" };
}

function confirmDrawer() {
  selectedTags.value = [];
  appliedDrawer.value = { ...draftDrawer.value };
  drawerOpen.value = false;
  void loadFeed(true);
}

function closeDrawer() { drawerOpen.value = false; }

function selectDrawerOption(key: "subject" | "setting" | "background", value: string) {
  draftDrawer.value = { ...draftDrawer.value, [key]: draftDrawer.value[key] === value ? "" : value };
}

function openDrama(id: string) {
  if (!id) return;
  uni.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(id)}` });
}
</script>

<template>
  <view class="home-page">
    <view class="search-row">
      <view class="search-field" @tap="openSearch">
        <image class="magnifier" :src="NAV_ICONS.search" mode="aspectFit" aria-hidden="true" />
        <text class="search-placeholder" aria-label="搜索短剧">搜剧名、演员、剧情</text>
      </view>
    </view>

    <scroll-view class="channels" scroll-x enable-flex aria-label="短剧分类">
      <view class="channels-inner">
        <button
          v-for="channel in HOME_PRIMARY_CHANNELS"
          :key="channel"
          class="channel"
          :class="{ active: activeCategory === channel }"
          @tap="selectCategory(channel)"
        >
          {{ channel }}
        </button>
      </view>
    </scroll-view>

    <view v-if="activeCategory === HOME_RECOMMEND_CHANNEL" class="quick-actions" aria-label="首页工具">
      <button class="quick-action quick-purple" @tap="openFilterPage"><image class="quick-icon" :src="NAV_ICONS.filter" mode="aspectFit" aria-hidden="true" /><text>筛选</text></button>
      <button class="quick-action quick-orange" @tap="openRankingPage"><image class="quick-icon" src="/static/icons/icon-fire.svg" mode="aspectFit" aria-hidden="true" /><text>排行榜</text></button>
      <button class="quick-action quick-cyan" @tap="openNewDrama"><image class="quick-icon" src="/static/icons/icon-play-white.svg" mode="aspectFit" aria-hidden="true" /><text>新剧</text></button>
    </view>

    <view v-if="activeCategory !== HOME_RECOMMEND_CHANNEL" class="sub-filter-row">
      <scroll-view class="sub-filters" scroll-x enable-flex aria-label="细分标签">
        <view class="sub-filters-inner">
          <button v-for="tag in subTags" :key="tag" class="sub-filter" :class="{ selected: selectedTags.includes(tag) }" @tap="toggleTag(tag)">{{ tag }}</button>
        </view>
      </scroll-view>
      <button class="filter-entry" :class="{ selected: selectedTags.length }" @tap="openDrawer">
        <text v-if="selectedTags.length">{{ selectedTags.length }}</text>
        <image v-else :src="NAV_ICONS.arrowDown" mode="aspectFit" aria-hidden="true" />
      </button>
    </view>

    <view v-if="isMock" class="mock-note">内部体验 · 分类与剧集分页来自 Mock 数据</view>
    <view v-if="loading" class="feed-state">正在加载短剧…</view>
    <view v-else-if="error" class="feed-state" role="alert">{{ error }}</view>
    <view v-else-if="!dramas.length" class="feed-state">这个分类暂时没有短剧</view>
    <view v-else class="drama-grid" aria-label="短剧列表">
      <button
        v-for="item in dramas"
        :key="item.id"
        class="drama-card"
        :aria-label="`查看 ${item.title}`"
        @tap="openDrama(item.id)"
      >
        <view class="poster" :class="`poster-${item.tone}`">
          <view class="hot-badge">短剧</view>
          <view class="poster-copy">
            <text class="poster-title">{{ item.title }}</text>
            <text class="poster-subtitle">{{ item.subtitle }}</text>
          </view>
        </view>
        <view class="drama-title">{{ item.title }}</view>
        <view class="ranking">{{ item.ranking }} <image :src="NAV_ICONS.arrowRight" mode="aspectFit" aria-hidden="true" /></view>
      </button>
    </view>
    <view v-if="loadingMore" class="feed-state">正在加载更多…</view>
    <view v-else-if="hasMore" class="feed-state">上滑加载更多</view>
    <view v-else-if="dramas.length" class="feed-state">已经到底了</view>

    <view v-if="drawerOpen" class="drawer-mask" @tap="closeDrawer">
      <view class="filter-drawer" @tap.stop>
        <view class="drawer-header"><button class="drawer-close" aria-label="关闭筛选" @tap="closeDrawer"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></button><text>筛选</text><view class="drawer-spacer" /></view>
        <scroll-view class="drawer-content" scroll-y :show-scrollbar="false">
          <view v-for="section in drawerSections" :key="section.key" class="drawer-section">
            <text class="drawer-title">{{ section.title }}</text>
            <view class="drawer-options"><button v-for="value in section.values" :key="value" class="drawer-option" :class="{ selected: draftDrawer[section.key] === value }" @tap="selectDrawerOption(section.key, value)">{{ value }}</button></view>
          </view>
        </scroll-view>
        <view class="drawer-footer"><button class="drawer-clear" @tap="clearDrawer">清空</button><button class="drawer-confirm" @tap="confirmDrawer">确定</button></view>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #f7f7f8;
  color: #19191d;
}
</style>
<style scoped src="../../styles/home.scss"></style>
