<script setup lang="ts">
import { boundListQuery, LIST_QUERY_MAX_LENGTH, type DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { ref } from "vue";
import { HOME_RECOMMEND_CHANNEL } from "../../constants/runtime";
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
const query = ref("");
const categories = ref<string[]>(buildHomeChannels([]));
const activeCategory = ref(HOME_RECOMMEND_CHANNEL);
const dramas = ref<HomeDrama[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const quickActions = [
  { icon: "筛", label: "筛选", tone: "purple" },
  { icon: "热", label: "排行榜", tone: "orange" },
  { icon: "播", label: "新剧", tone: "cyan" }
];

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
      nextPage
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
  const q = boundListQuery(query.value);
  uni.navigateTo({
    url: q ? `/pages/search/index?q=${encodeURIComponent(q)}` : "/pages/search/index"
  });
}

function selectCategory(category: string) {
  if (!category || category === activeCategory.value) return;
  activeCategory.value = category;
  void loadFeed(true);
}

function showAction(label: string) {
  uni.showToast({ title: `${label}功能即将开放`, icon: "none" });
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
        <text class="search-icon">⌕</text>
        <input
          v-model="query"
          confirm-type="search"
          :maxlength="LIST_QUERY_MAX_LENGTH"
          placeholder="搜剧名、演员、剧情"
          placeholder-class="search-placeholder"
          aria-label="搜索短剧"
          @confirm="openSearch"
        />
      </view>
    </view>

    <scroll-view class="channels" scroll-x enable-flex aria-label="短剧分类">
      <view class="channels-inner">
        <button
          v-for="channel in categories"
          :key="channel"
          class="channel"
          :class="{ active: activeCategory === channel }"
          @tap="selectCategory(channel)"
        >
          {{ channel }}
        </button>
      </view>
    </scroll-view>

    <view class="quick-actions" aria-label="快捷入口">
      <button
        v-for="action in quickActions"
        :key="action.label"
        class="quick-action"
        :aria-label="action.label"
        @tap="showAction(action.label)"
      >
        <view class="quick-icon" :class="`quick-${action.tone}`">{{ action.icon }}</view>
        <text>{{ action.label }}</text>
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
        <view class="ranking">{{ item.ranking }} ›</view>
      </button>
    </view>
    <view v-if="loadingMore" class="feed-state">正在加载更多…</view>
    <view v-else-if="hasMore" class="feed-state">上滑加载更多</view>
    <view v-else-if="dramas.length" class="feed-state">已经到底了</view>
  </view>
</template>

<style>
page {
  background: #f7f7f8;
  color: #19191d;
}
</style>
<style scoped src="../../styles/home.scss"></style>
