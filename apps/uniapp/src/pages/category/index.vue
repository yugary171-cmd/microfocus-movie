<script setup lang="ts">
import { boundListQuery, LIST_QUERY_MAX_LENGTH, type DramaCard } from "@microfocus/contracts";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { getApi, isMockMode } from "../../services/api";
import { getStorageSync, removeStorageSync } from "../../platform/storage";
import { toFriendlyErrorMessage } from "../../utils/errors";

const isMock = isMockMode();
const query = ref("");
const category = ref("全部");
const categories = ref<string[]>(["全部"]);
const results = ref<DramaCard[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const searched = ref(false);
const error = ref("");

async function search(reset: boolean) {
  if (loadingMore.value) return;
  const nextPage = reset ? 1 : page.value + 1;
  if (reset) {
    loading.value = true;
    error.value = "";
  } else {
    loadingMore.value = true;
    error.value = "";
  }
  try {
    const response = await getApi().search(
      boundListQuery(query.value),
      category.value === "全部" ? "" : boundListQuery(category.value),
      nextPage
    );
    results.value = reset ? response.items : [...results.value, ...response.items];
    page.value = response.page || nextPage;
    hasMore.value = Boolean(response.hasMore);
    searched.value = true;
  } catch (caught) {
    error.value = toFriendlyErrorMessage(caught);
    searched.value = true;
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadCategoriesAndSearch() {
  try {
    const catalog = await getApi().getCatalog();
    categories.value = catalog.categories.includes("全部")
      ? catalog.categories
      : ["全部", ...catalog.categories];
  } catch {
    // Search still works when category suggestions fail.
  }
  await search(true);
}

onLoad(() => {
  void loadCategoriesAndSearch();
});

onShow(() => {
  const pending = getStorageSync<string>("microfocus.pending-category");
  if (pending) {
    removeStorageSync("microfocus.pending-category");
    category.value = pending;
    void search(true);
  }
});

function selectCategory(value: string) {
  category.value = value;
  void search(true);
}

function loadMore() {
  if (hasMore.value) void search(false);
}
</script>

<template>
  <view class="page">
    <internal-banner :visible="isMock" />
    <view class="page-title">找你想看的</view>
    <view class="search-box">
      <input
        class="search-input"
        v-model="query"
        confirm-type="search"
        :maxlength="LIST_QUERY_MAX_LENGTH"
        placeholder="搜索剧名或标签"
        placeholder-class="search-placeholder"
        aria-label="搜索剧名或标签"
        @confirm="search(true)"
      />
      <button class="search-button" :loading="loading" aria-label="提交搜索" @tap="search(true)">搜索</button>
    </view>
    <scroll-view scroll-x enable-flex class="filters" aria-label="短剧分类">
      <button
        v-for="item in categories"
        :key="item"
        class="filter"
        :class="{ active: category === item }"
        :aria-pressed="category === item"
        @tap="selectCategory(item)"
      >
        {{ item }}
      </button>
    </scroll-view>

    <view v-if="loading" class="state-card" role="status">正在搜索…</view>
    <view v-else-if="error" class="state-card" role="alert">
      <view class="state-title">搜索失败</view>
      <view>{{ error }}</view>
      <button class="secondary-button retry" @tap="search(true)">重试</button>
    </view>
    <view v-else-if="searched && !results.length" class="state-card">
      <view class="state-title">没有找到相关短剧</view>
      <view>换个关键词或分类试试。</view>
    </view>
    <view v-else class="results">
      <drama-card v-for="item in results" :key="item.id" :drama="item" compact />
      <button
        v-if="hasMore"
        class="secondary-button load-more"
        :loading="loadingMore"
        @tap="loadMore"
      >
        加载更多
      </button>
    </view>
  </view>
</template>

<style scoped src="../../styles/category.scss"></style>
