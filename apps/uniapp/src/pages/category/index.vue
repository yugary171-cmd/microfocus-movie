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
const filtersExpanded = ref(true);
const filterSections = [
  { key: "format", label: "全部体裁", options: ["全部体裁", "真人剧", "漫剧", "AI 剧"] },
  { key: "subject", label: "全部主题", options: ["全部主题", "现代", "女性成长", "脑洞", "奇幻", "玄幻", "古言", "战神", "宫斗"] },
  { key: "setting", label: "全部设定", options: ["全部设定", "打脸虐渣", "大男主", "大女主", "马甲", "重生", "穿越", "系统"] },
  { key: "background", label: "全部背景", options: ["全部背景", "现代", "都市", "古代", "乡村", "年代", "架空", "职场"] },
  { key: "recommendation", label: "全部推荐", options: ["全部推荐", "最新上架", "最高热度", "最高收藏"] },
  { key: "audience", label: "全部受众", options: ["全部受众", "男频", "女频"] },
  { key: "time", label: "全部时间", options: ["全部时间", "7天内上新", "14天内上新", "30天内上新", "90天内上新"] }
] as const;
const selectedFilters = ref<Record<string, string>>({
  format: "全部体裁", subject: "全部主题", setting: "全部设定", background: "全部背景",
  recommendation: "全部推荐", audience: "全部受众", time: "全部时间"
});

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
    const subject = selectedFilters.value.subject || "";
    const setting = selectedFilters.value.setting || "";
    const background = selectedFilters.value.background || "";
    const format = selectedFilters.value.format || "全部体裁";
    const response = await getApi().search(
      boundListQuery(query.value),
      format === "全部体裁" ? "" : boundListQuery(format),
      nextPage,
      {
        subject: subject === "全部主题" ? "" : subject,
        setting: setting === "全部设定" ? "" : setting,
        background: background === "全部背景" ? "" : background
      }
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

function selectFilter(key: string, value: string) {
  selectedFilters.value = { ...selectedFilters.value, [key]: value };
  if (key === "format") category.value = value === "全部体裁" ? "全部" : value;
  void search(true);
}

function loadMore() {
  if (hasMore.value) void search(false);
}

function goBack() { uni.navigateBack(); }
</script>

<template>
  <view class="page">
    <internal-banner :visible="isMock" />
    <view class="category-header"><view class="back" @tap="goBack">‹</view><view class="page-title">筛选</view></view>
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
    <view class="filter-panel">
      <view v-for="section in filterSections" :key="section.key" class="filter-row">
        <button class="filter-label">{{ selectedFilters[section.key] }}</button>
        <scroll-view v-if="filtersExpanded" class="filter-values" scroll-x enable-flex>
          <button v-for="option in section.options" :key="option" class="filter-value" :class="{ active: selectedFilters[section.key] === option }" @tap="selectFilter(section.key, option)">{{ option }}</button>
        </scroll-view>
      </view>
      <button class="collapse-button" @tap="filtersExpanded = !filtersExpanded">{{ filtersExpanded ? "收起⌃" : "展开⌄" }}</button>
    </view>

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
