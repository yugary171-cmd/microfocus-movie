<script setup lang="ts">
import { onLoad, onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { getApi, getStoredSession, isMockMode } from "../../services/api";
import { loadFavoriteCards, loadLikedDramaCards, removeLibraryItems } from "../../services/library";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { toHistoryCardViews, type HistoryCardView } from "../../utils/history-view";
import {
  FAVORITE_TAB,
  HISTORY_TAB,
  LIKE_TAB,
  LIBRARY_EDIT_COPY,
  parseLibraryGridTab,
  type LibraryGridTab
} from "../../utils/inbox-view";

const isMock = isMockMode();
const libraryTab = ref<LibraryGridTab>(HISTORY_TAB);
const copy = computed(() => LIBRARY_EDIT_COPY[libraryTab.value]);
const navInsetTop = ref(52);
const items = ref<HistoryCardView[]>([]);
const selectedIds = ref<string[]>([]);
const loading = ref(false);
const error = ref("");
const confirmOpen = ref(false);
const deleting = ref(false);

const selectedCount = computed(() => selectedIds.value.length);
const canDelete = computed(() => selectedCount.value > 0 && !deleting.value);

function itemKey(item: HistoryCardView): string {
  return item.dramaId || item.id;
}

function isSelected(item: HistoryCardView): boolean {
  return selectedIds.value.includes(itemKey(item));
}

async function loadItems() {
  loading.value = true;
  error.value = "";
  try {
    if (libraryTab.value === HISTORY_TAB) {
      items.value = toHistoryCardViews(await getApi().getHistory());
    } else if (libraryTab.value === FAVORITE_TAB) {
      items.value = await loadFavoriteCards();
    } else if (libraryTab.value === LIKE_TAB) {
      items.value = await loadLikedDramaCards();
    } else {
      items.value = [];
    }
    const available = new Set(items.value.map(itemKey).filter(Boolean));
    selectedIds.value = selectedIds.value.filter((id) => available.has(id));
  } catch (loadError) {
    error.value = toFriendlyErrorMessage(loadError);
  } finally {
    loading.value = false;
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

onLoad((query) => {
  libraryTab.value = parseLibraryGridTab(query?.tab ? decodeURIComponent(String(query.tab)) : HISTORY_TAB);
});

onShow(() => {
  measureNavInset();
  if (!isMock && !getStoredSession()) {
    uni.navigateBack();
    return;
  }
  void loadItems();
});

function selectAll() {
  selectedIds.value = items.value.map(itemKey).filter(Boolean);
}

function finish() {
  uni.navigateBack();
}

function toggleItem(item: HistoryCardView) {
  const key = itemKey(item);
  if (!key) return;
  selectedIds.value = isSelected(item)
    ? selectedIds.value.filter((id) => id !== key)
    : [...selectedIds.value, key];
}

function openConfirm() {
  if (!canDelete.value) return;
  confirmOpen.value = true;
}

function closeConfirm() {
  if (deleting.value) return;
  confirmOpen.value = false;
}

async function confirmDelete() {
  if (!canDelete.value) return;
  deleting.value = true;
  try {
    if (libraryTab.value === HISTORY_TAB) {
      await getApi().deleteHistory({ dramaIds: [...selectedIds.value] });
    } else {
      await removeLibraryItems(libraryTab.value, [...selectedIds.value]);
    }
    confirmOpen.value = false;
    selectedIds.value = [];
    await loadItems();
    uni.showToast({ title: "已删除", icon: "success" });
  } catch (deleteError) {
    confirmOpen.value = false;
    uni.showToast({ title: toFriendlyErrorMessage(deleteError), icon: "none" });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <view class="history-edit">
    <view class="edit-nav" :style="{ paddingTop: `${navInsetTop}px` }">
      <view class="nav-action" hover-class="none" @tap="selectAll">全选</view>
      <view class="nav-center">
        <text class="nav-title">{{ copy.title }}</text>
        <text class="nav-count">已选择 {{ selectedCount }} 个</text>
      </view>
      <view class="nav-done" hover-class="none" @tap="finish">完成</view>
    </view>

    <view v-if="loading" class="edit-state">{{ copy.loading }}</view>
    <view v-else-if="error" class="edit-state" role="alert">{{ error }}</view>
    <view v-else-if="!items.length" class="edit-state">{{ copy.empty }}</view>
    <view v-else class="history-grid">
      <view
        v-for="item in items"
        :key="item.id"
        class="history-item"
        @tap="toggleItem(item)"
      >
        <view class="history-poster" :class="`poster-${item.tone}`">
          <text class="poster-tag">{{ item.tag }}</text>
          <view class="select-mark" :class="{ on: isSelected(item) }" />
        </view>
        <view class="drama-name">{{ item.title }}</view>
        <view class="episode">{{ item.episode }}</view>
      </view>
    </view>

    <view class="delete-bar">
      <view
        class="delete-btn"
        :class="{ disabled: !canDelete }"
        hover-class="none"
        @tap="openConfirm"
      >
        <text>删除</text>
      </view>
    </view>

    <view v-if="confirmOpen" class="confirm-mask" @tap="closeConfirm">
      <view class="confirm-dialog" @tap.stop>
        <view class="confirm-text">{{ copy.confirm }}</view>
        <view class="confirm-actions">
          <view hover-class="none" @tap="closeConfirm">取消</view>
          <view class="danger" hover-class="none" @tap="confirmDelete">删除</view>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #fff;
  color: #17171b;
}
</style>
<style scoped src="../../styles/history-edit.scss"></style>
