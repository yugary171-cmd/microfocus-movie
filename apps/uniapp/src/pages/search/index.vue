<script setup lang="ts">
import { boundListQuery, LIST_QUERY_MAX_LENGTH, type CatalogResponse, type DramaCard } from "@microfocus/contracts";
import { onLoad, onReachBottom, onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { SEARCH_PLACEHOLDER } from "../../constants/search";
import { NAV_ICONS } from "../../constants/icons";
import { getApi } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { pickGuessQueries } from "../../utils/search-discovery";

const query = ref("");
const searchPlaceholder = ref(SEARCH_PLACEHOLDER);
const guessSeed = ref(Date.now());
const publishedTitles = ref<string[]>([]);
const guesses = computed(() => pickGuessQueries(publishedTitles.value, guessSeed.value, 8));
const searchHistory = ref<string[]>([]);
const results = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const searched = ref(false);
const error = ref("");
const navInsetTop = ref(52);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequestId = 0;

const SEARCH_HISTORY_KEY = "microfocus.search.history";
const SEARCH_HISTORY_LIMIT = 10;

function readSearchHistory(): string[] {
  try {
    const stored = uni.getStorageSync(SEARCH_HISTORY_KEY);
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(items: string[]) {
  try {
    uni.setStorageSync(SEARCH_HISTORY_KEY, items);
  } catch {
    // Local history is optional and must not block search.
  }
}

function rememberSearch(keyword: string) {
  const normalized = boundListQuery(keyword);
  if (!normalized) return;
  searchHistory.value = [normalized, ...searchHistory.value.filter((item) => item !== normalized)].slice(
    0,
    SEARCH_HISTORY_LIMIT
  );
  writeSearchHistory(searchHistory.value);
}

function randomPublishedTitle(catalog: CatalogResponse): string {
  const titles = [...(Array.isArray(catalog.latest) ? catalog.latest : []), ...(Array.isArray(catalog.popular) ? catalog.popular : []), ...(Array.isArray(catalog.featured) ? catalog.featured : [])]
    .map((item) => item.title.trim())
    .filter(Boolean);
  const uniqueTitles = [...new Set(titles)];
  return uniqueTitles[Math.floor(Math.random() * uniqueTitles.length)] || SEARCH_PLACEHOLDER;
}

function publishedTitlesFromCatalog(catalog: CatalogResponse): string[] {
  const titles = [
    ...(Array.isArray(catalog.latest) ? catalog.latest : []),
    ...(Array.isArray(catalog.popular) ? catalog.popular : []),
    ...(Array.isArray(catalog.featured) ? catalog.featured : [])
  ].map((item) => item.title.trim()).filter(Boolean);
  return [...new Set(titles)];
}

async function refreshSearchDiscovery() {
  try {
    const catalog = await getApi().getCatalog();
    publishedTitles.value = publishedTitlesFromCatalog(catalog);
    searchPlaceholder.value = randomPublishedTitle(catalog);
    guessSeed.value = Date.now();
  } catch {
    publishedTitles.value = [];
    searchPlaceholder.value = SEARCH_PLACEHOLDER;
  }
}

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

async function runSearch(reset: boolean, remember = false) {
  const keyword = boundListQuery(query.value);
  if (!keyword) {
    uni.showToast({ title: "请输入搜索内容", icon: "none" });
    return;
  }
  await loadKeyword(keyword, reset, remember);
}

async function loadKeyword(keyword: string, reset: boolean, remember = false) {
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
  const requestId = ++searchRequestId;
  try {
    const response = await getApi().search(keyword, "", nextPage);
    if (requestId !== searchRequestId) return;
    const items = Array.isArray(response.items) ? response.items : [];
    results.value = reset ? items : [...results.value, ...items];
    page.value = response.page || nextPage;
    hasMore.value = Boolean(response.hasMore);
    if (remember) rememberSearch(keyword);
  } catch (caught) {
    if (requestId !== searchRequestId) return;
    error.value = toFriendlyErrorMessage(caught);
    if (reset) results.value = [];
  } finally {
    if (requestId === searchRequestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

onShow(() => {
  measureNavInset();
  searchHistory.value = readSearchHistory();
  void refreshSearchDiscovery();
});

onLoad((options) => {
  const initial = options?.q ? boundListQuery(decodeURIComponent(options.q)) : "";
  if (initial) {
    query.value = initial;
    void runSearch(true);
  }
});

onReachBottom(() => {
  if (searched.value && hasMore.value && !loading.value) {
    void runSearch(false);
  }
});

function goBack() {
  uni.navigateBack({ delta: 1 });
}

function submitSearch() {
  if (!query.value.trim()) query.value = searchPlaceholder.value;
  void runSearch(true, true);
}

function handleInput(event: any) {
  query.value = boundListQuery(event.detail.value || "");
  if (searchTimer) clearTimeout(searchTimer);
  if (!query.value) {
    searchRequestId += 1;
    results.value = [];
    searched.value = false;
    error.value = "";
    loading.value = false;
    loadingMore.value = false;
    return;
  }
  searchTimer = setTimeout(() => {
    void runSearch(true);
  }, 220);
}

function chooseSuggestion(value: string) {
  query.value = boundListQuery(value);
  void runSearch(true, true);
}

function chooseHistory(value: string) {
  query.value = boundListQuery(value);
  void runSearch(true, true);
}

function refreshGuesses() {
  guessSeed.value = Date.now();
}

function clearSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchRequestId += 1;
  query.value = "";
  results.value = [];
  searched.value = false;
  error.value = "";
  page.value = 1;
  hasMore.value = false;
  loading.value = false;
  loadingMore.value = false;
}

function removeHistory(value: string) {
  searchHistory.value = searchHistory.value.filter((item) => item !== value);
  writeSearchHistory(searchHistory.value);
}

function clearHistory() {
  searchHistory.value = [];
  writeSearchHistory([]);
}
</script>

<template>
  <view class="search-page" :style="{ paddingTop: `${navInsetTop}px` }">
    <view class="topbar">
      <button class="back-button" aria-label="返回" @tap="goBack"><image :src="NAV_ICONS.arrowRight" class="back-icon" mode="aspectFit" aria-hidden="true" /></button>
      <view class="search-box">
        <image class="magnifier" :src="NAV_ICONS.search" mode="aspectFit" aria-hidden="true" />
        <input
          class="search-input"
          v-model="query"
          confirm-type="search"
          :maxlength="LIST_QUERY_MAX_LENGTH"
          :placeholder="searchPlaceholder"
          placeholder-class="search-placeholder"
          :aria-label="searchPlaceholder"
          @input="handleInput"
          @confirm="submitSearch"
        />
        <view v-if="query" class="clear-input" aria-label="清除搜索内容" @tap.stop="clearSearch"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></view>
      </view>
      <button class="submit-button" :loading="loading" @tap="submitSearch">搜索</button>
    </view>

    <view v-if="!searched" class="idle">
      <view v-if="searchHistory.length" class="history-section">
        <view class="section-heading">
          <view class="section-title">历史搜索</view>
          <button class="history-clear" @tap="clearHistory">清空</button>
        </view>
        <view class="history-list">
          <view v-for="item in searchHistory" :key="item" class="history-item" @tap="chooseHistory(item)">
            <text class="history-text">{{ item }}</text>
            <view class="history-remove" aria-label="删除记录" @tap.stop="removeHistory(item)"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></view>
          </view>
        </view>
      </view>
      <view class="guess-heading">
        <view class="section-title">猜你想搜</view>
        <button class="refresh" aria-label="换一批" @tap="refreshGuesses"><image :src="NAV_ICONS.arrowDown" mode="aspectFit" aria-hidden="true" /></button>
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
      没有找到“{{ query }}”相关短剧
    </view>
    <view v-else-if="results.length" class="section">
      <view class="result-heading">
        <view class="section-title">搜索结果</view>
        <button v-if="searched" class="clear" @tap="clearSearch">
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
