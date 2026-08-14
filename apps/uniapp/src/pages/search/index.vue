<script setup lang="ts">
import type { DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import {
  SEARCH_GUESS_POOL,
  SEARCH_PLACEHOLDER,
  SEARCH_SHORTCUTS,
  type SearchShortcutId
} from "../../constants/search";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { pickGuessQueries } from "../../utils/search-discovery";

const shortcuts = SEARCH_SHORTCUTS;
const query = ref("");
const guessSeed = ref(Date.now());
const guesses = computed(() => pickGuessQueries(SEARCH_GUESS_POOL, guessSeed.value, 8));
const results = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const searched = ref(false);
const error = ref("");
const discoveryTitle = ref("");

async function runSearch(reset: boolean) {
  const keyword = query.value.trim();
  if (!keyword) {
    uni.showToast({ title: "请输入搜索内容", icon: "none" });
    return;
  }
  discoveryTitle.value = "";
  await loadKeyword(keyword, reset);
}

async function loadKeyword(keyword: string, reset: boolean) {
  if (loadingMore.value) return;
  const nextPage = reset ? 1 : page.value + 1;
  if (reset) {
    loading.value = true;
    error.value = "";
    searched.value = true;
  } else {
    if (!hasMore.value) return;
    loadingMore.value = true;
  }
  try {
    const response = await getApi().search(keyword, "", nextPage);
    const items = Array.isArray(response.items) ? response.items : [];
    results.value = reset ? items : [...results.value, ...items];
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

async function loadCatalogList(kind: "rank" | "new") {
  loading.value = true;
  error.value = "";
  searched.value = true;
  hasMore.value = false;
  discoveryTitle.value = kind === "rank" ? "排行" : "上新";
  try {
    const catalog = await getApi().getCatalog();
    results.value = kind === "rank" ? catalog.popular || [] : catalog.latest || [];
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

onLoad((options) => {
  const initial = options?.q ? decodeURIComponent(options.q) : "";
  if (initial) {
    query.value = initial;
    void runSearch(true);
  }
});

onReachBottom(() => {
  if (searched.value && !discoveryTitle.value && hasMore.value && !loading.value) {
    void runSearch(false);
  }
});

function goBack() {
  uni.navigateBack({ delta: 1 });
}

function submitSearch() {
  void runSearch(true);
}

function chooseSuggestion(value: string) {
  query.value = value;
  void runSearch(true);
}

function refreshGuesses() {
  guessSeed.value = Date.now();
}

function handleShortcut(id: SearchShortcutId) {
  if (id === "rank") {
    void loadCatalogList("rank");
    return;
  }
  if (id === "new") {
    void loadCatalogList("new");
    return;
  }
  if (id === "filter") {
    uni.navigateTo({ url: "/pages/category/index" });
    return;
  }
  uni.showToast({ title: "演员检索本轮不做独立接口，请用剧名搜索", icon: "none" });
}
</script>

<template>
  <view class="search-page">
    <view class="topbar">
      <button class="back-button" aria-label="返回" @tap="goBack">‹</button>
      <view class="search-box">
        <view class="magnifier" />
        <input
          class="search-input"
          v-model="query"
          confirm-type="search"
          :placeholder="SEARCH_PLACEHOLDER"
          placeholder-class="search-placeholder"
          :aria-label="SEARCH_PLACEHOLDER"
          @confirm="submitSearch"
        />
      </view>
      <button class="submit-button" :loading="loading" @tap="submitSearch">搜索</button>
    </view>

    <view v-if="!searched" class="idle">
      <view class="shortcuts" aria-label="搜索快捷入口">
        <button
          v-for="item in shortcuts"
          :key="item.id"
          class="shortcut"
          :aria-label="item.label"
          @tap="handleShortcut(item.id)"
        >
          <view class="shortcut-icon" :class="`tone-${item.tone}`" />
          <text>{{ item.label }}</text>
        </button>
      </view>

      <view class="guess-heading">
        <view class="section-title">猜你想搜</view>
        <button class="refresh" aria-label="换一批" @tap="refreshGuesses">↻</button>
      </view>
      <view class="guess-grid">
        <button
          v-for="item in guesses"
          :key="item"
          class="guess"
          @tap="chooseSuggestion(item)"
        >
          {{ item }}
        </button>
      </view>
    </view>

    <view v-if="loading" class="empty-state">正在搜索…</view>
    <view v-else-if="error" class="empty-state" role="alert">{{ error }}</view>
    <view v-else-if="searched && !results.length" class="empty-state">
      没有找到“{{ discoveryTitle || query }}”相关短剧
    </view>
    <view v-else-if="results.length" class="section">
      <view class="result-heading">
        <view class="section-title">{{ discoveryTitle || "搜索结果" }}</view>
        <button v-if="searched" class="clear" @tap="searched = false; results = []; error = ''">
          返回发现
        </button>
      </view>
      <drama-card v-for="item in results" :key="item.id" :drama="item" compact />
      <view v-if="loadingMore" class="empty-state">正在加载更多…</view>
      <view v-else-if="hasMore" class="empty-state">上滑加载更多</view>
    </view>
  </view>
</template>

<style>
page {
  min-height: 100%;
  color: #17171b;
  background: #fff;
}
</style>
<style scoped src="../../styles/search.scss"></style>
