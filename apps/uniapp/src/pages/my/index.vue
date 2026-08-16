<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import {
  isWechatProfileAuthorizationDenied,
  obtainWechatUserProfile,
  wechatMiniprogramAuthSupported
} from "../../platform";
import {
  applyLocalWechatProfile,
  ensureSession,
  getApi,
  getStoredSession,
  isMockMode,
  saveProfile
} from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { resolveHistoryPlayerUrl } from "../../utils/history-navigation";
import {
  createMockHistoryCards,
  toHistoryCardViews,
  type HistoryCardView
} from "../../utils/history-view";
import {
  cloneHistorySheetFilter,
  DEFAULT_HISTORY_SHEET_FILTER,
  filterHistoryItems,
  HISTORY_COMPLETION_FILTERS,
  HISTORY_DURATION_OPTIONS,
  HISTORY_FORMAT_OPTIONS,
  HISTORY_TIME_OPTIONS,
  isDefaultHistorySheetFilter,
  isHistoryCompletionFilter,
  type HistoryCompletionFilter,
  type HistoryDurationId,
  type HistoryFormatId,
  type HistorySheetFilter,
  type HistoryTimeId
} from "../../utils/history-filter";
import { INBOX_ITEMS, INBOX_TAB, LIBRARY_TABS } from "../../utils/inbox-view";

const HISTORY_ITEMS: HistoryCardView[] = createMockHistoryCards();

type UserView = { displayName: string; microfocusId: string; initial: string; avatarUrl: string };

function toUserView(session: ReturnType<typeof getStoredSession>): UserView | null {
  if (!session) return null;
  const name = session.user.displayName || "微信用户";
  return {
    displayName: name,
    microfocusId: `微焦号 · ${session.user.id.slice(0, 12).toUpperCase()}`,
    initial: name.slice(0, 1) || "微",
    avatarUrl: session.user.avatarUrl || ""
  };
}

const isMock = isMockMode();
const user = ref<UserView | null>(null);
const loginLoading = ref(false);
const loginError = ref("");
const avatarSaving = ref(false);
const historyLoading = ref(false);
const historyError = ref("");
const activeHistoryTab = ref<(typeof LIBRARY_TABS)[number]>("历史");
const historyTabs = LIBRARY_TABS;
const historyFilters = HISTORY_COMPLETION_FILTERS;
const activeFilter = ref<HistoryCompletionFilter>("全部");
const historyItems = ref<HistoryCardView[]>(isMock ? HISTORY_ITEMS : []);
const inboxItems = INBOX_ITEMS;
const filterOpen = ref(false);
const filterClosingLocked = ref(false);
const appliedSheetFilter = ref<HistorySheetFilter>(cloneHistorySheetFilter());
const draftSheetFilter = ref<HistorySheetFilter>(cloneHistorySheetFilter());
const formatOptions = HISTORY_FORMAT_OPTIONS;
const durationOptions = HISTORY_DURATION_OPTIONS;
const timeOptions = HISTORY_TIME_OPTIONS;
const sheetFilterActive = computed(() => !isDefaultHistorySheetFilter(appliedSheetFilter.value));
const visibleHistoryItems = computed(() =>
  filterHistoryItems(historyItems.value, {
    completion: activeFilter.value,
    sheet: appliedSheetFilter.value
  })
);

async function loadLiveHistory() {
  historyLoading.value = true;
  historyError.value = "";
  try {
    historyItems.value = toHistoryCardViews(await getApi().getHistory());
  } catch (error) {
    historyError.value = toFriendlyErrorMessage(error);
  } finally {
    historyLoading.value = false;
  }
}

onShow(() => {
  user.value = toUserView(getStoredSession());
  if (user.value && !isMock) void loadLiveHistory();
});

async function login() {
  if (loginLoading.value) return;
  loginError.value = "";
  try {
    const profile = wechatMiniprogramAuthSupported() ? await obtainWechatUserProfile() : null;
    loginLoading.value = true;
    const session = await ensureSession();
    const stored = profile ? applyLocalWechatProfile(profile) : session;
    user.value = toUserView(stored);
    if (!isMock) await loadLiveHistory();
    uni.showToast({ title: "登录成功", icon: "success" });
  } catch (error) {
    if (isWechatProfileAuthorizationDenied(error)) {
      uni.showToast({ title: "已取消授权", icon: "none" });
      return;
    }
    loginError.value = toFriendlyErrorMessage(error);
  } finally {
    loginLoading.value = false;
  }
}

function selectCompletionFilter(item: string) {
  if (isHistoryCompletionFilter(item)) activeFilter.value = item;
}

function openHistoryFilter() {
  draftSheetFilter.value = cloneHistorySheetFilter(appliedSheetFilter.value);
  filterClosingLocked.value = true;
  filterOpen.value = true;
  setTimeout(() => {
    filterClosingLocked.value = false;
  }, 320);
}

function closeHistoryFilter() {
  if (filterClosingLocked.value) return;
  filterOpen.value = false;
  draftSheetFilter.value = cloneHistorySheetFilter(appliedSheetFilter.value);
}

function selectDraftFormat(id: HistoryFormatId) {
  draftSheetFilter.value = { ...draftSheetFilter.value, format: id };
}

function selectDraftDuration(id: HistoryDurationId) {
  draftSheetFilter.value = { ...draftSheetFilter.value, duration: id };
}

function selectDraftTime(id: HistoryTimeId) {
  draftSheetFilter.value = { ...draftSheetFilter.value, time: id };
}

function clearDraftHistoryFilter() {
  draftSheetFilter.value = cloneHistorySheetFilter(DEFAULT_HISTORY_SHEET_FILTER);
}

function confirmHistoryFilter() {
  appliedSheetFilter.value = cloneHistorySheetFilter(draftSheetFilter.value);
  filterOpen.value = false;
}

function showFeature(label: string) {
  uni.showToast({ title: `${label}为体验数据`, icon: "none" });
}

function selectLibraryTab(item: (typeof LIBRARY_TABS)[number]) {
  activeHistoryTab.value = item;
}

function openProfile() {
  uni.navigateTo({ url: "/pages/profile/edit" });
}

async function persistAvatar(nextUrl: string) {
  if (!nextUrl || avatarSaving.value || !user.value) return;
  avatarSaving.value = true;
  try {
    const stored = await saveProfile({ avatarUrl: nextUrl });
    user.value = toUserView(stored) ?? {
      ...user.value,
      avatarUrl: stored?.user.avatarUrl || nextUrl
    };
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  } finally {
    avatarSaving.value = false;
  }
}

function onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  const nextUrl = event.detail?.avatarUrl?.trim();
  if (nextUrl) void persistAvatar(nextUrl);
}

function onAvatarTap() {
  if (wechatMiniprogramAuthSupported()) return;
  uni.chooseImage({
    count: 1,
    success: (result) => {
      const nextUrl = result.tempFilePaths[0];
      if (nextUrl) void persistAvatar(nextUrl);
    }
  });
}

async function openHistory(id: string) {
  const item = historyItems.value.find((entry) => entry.id === id);
  if (!item) return;
  if (isMock || !item.dramaId) {
    uni.switchTab({ url: "/pages/theater/index" });
    return;
  }
  try {
    const url = await resolveHistoryPlayerUrl(item, (dramaId) => getApi().getDrama(dramaId));
    uni.navigateTo({ url });
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  }
}
</script>

<template>
  <view class="my-page">
    <view class="ambient" />

    <view v-if="!user" class="guest-profile">
      <view class="guest-copy">
        <view class="guest-title">免费短剧，尽在微焦</view>
        <view class="guest-subtitle">登录后同步观看记录</view>
      </view>
      <button class="login-button" :loading="loginLoading" :disabled="loginLoading" @tap="login">
        {{ loginLoading ? "微信登录中…" : "立即登录" }}
      </button>
    </view>
    <view v-else class="member-profile">
      <button
        class="avatar"
        hover-class="none"
        open-type="chooseAvatar"
        aria-label="更换头像"
        :disabled="avatarSaving"
        @chooseavatar="onChooseAvatar"
        @tap="onAvatarTap"
      >
        <image v-if="user.avatarUrl" class="avatar-photo" :src="user.avatarUrl" mode="aspectFill" />
        <text v-else>{{ user.initial }}</text>
      </button>
      <view class="member-copy">
        <view class="member-name">{{ user.displayName }}</view>
        <view class="member-id">{{ user.microfocusId }} ⧉</view>
      </view>
      <button class="edit-button" @tap="openProfile">编辑资料</button>
    </view>
    <view v-if="loginError" class="login-error" role="alert">{{ loginError }}</view>

    <view v-if="user" class="stats">
      <view><strong>0</strong><text>关注</text></view>
      <view><strong>0</strong><text>粉丝</text></view>
      <view><strong>0</strong><text>获赞</text></view>
    </view>

    <view class="history-panel">
      <view class="history-tabs">
        <button
          v-for="item in historyTabs"
          :key="item"
          class="history-tab"
          :class="{ active: activeHistoryTab === item }"
          @tap="selectLibraryTab(item)"
        >
          {{ item }}
        </button>
        <button
          v-if="activeHistoryTab !== INBOX_TAB"
          class="history-search"
          aria-label="搜索历史"
          @tap="showFeature('历史搜索')"
        >
          ⌕
        </button>
      </view>
      <view v-if="activeHistoryTab === INBOX_TAB" class="inbox-list" aria-label="消息分类">
        <view v-if="isMock" class="mock-label">体验占位，不接消息接口</view>
        <view
          v-for="item in inboxItems"
          :key="item.id"
          class="inbox-row"
        >
          <view class="inbox-icon" :class="item.tone">{{ item.icon }}</view>
          <view class="inbox-copy">
            <view class="inbox-title">{{ item.title }}</view>
            <view class="inbox-preview">{{ item.preview }}</view>
          </view>
          <text v-if="item.meta" class="inbox-meta">{{ item.meta }}</text>
          <text v-else class="inbox-chevron">›</text>
        </view>
      </view>
      <view v-else>
        <view class="history-tools">
          <view class="filters">
            <button
              v-for="item in historyFilters"
              :key="item"
              class="filter"
              :class="{ active: activeFilter === item }"
              @tap="selectCompletionFilter(item)"
            >
              {{ item }}
            </button>
          </view>
          <view class="tool-actions">
            <button
              class="filter-trigger"
              :class="{ active: sheetFilterActive }"
              hover-class="none"
              @tap.stop="openHistoryFilter"
            >
              筛选
            </button>
            <button @tap="showFeature('编辑')">编辑</button>
          </view>
        </view>
        <view v-if="isMock" class="mock-label">Mock 观看记录</view>
        <view v-if="historyLoading" class="history-state">正在读取观看记录…</view>
        <view v-else-if="historyError" class="history-state" role="alert">{{ historyError }}</view>
        <view v-else-if="!historyItems.length" class="history-state">还没有观看记录</view>
        <view v-else-if="!visibleHistoryItems.length" class="history-state">没有符合筛选条件的记录</view>
        <view v-else class="history-grid">
          <button
            v-for="item in visibleHistoryItems"
            :key="item.id"
            class="history-item"
            :aria-label="`播放${item.title}`"
            @tap="openHistory(item.id)"
          >
            <view class="history-poster" :class="`poster-${item.tone}`">
              <text class="poster-tag">{{ item.tag }}</text>
              <text class="poster-title">{{ item.title }}</text>
            </view>
            <view class="drama-name">{{ item.title }}</view>
            <view class="episode">{{ item.episode }}</view>
          </button>
        </view>
      </view>
    </view>

    <root-portal v-if="filterOpen">
      <view class="filter-root" @touchmove.stop.prevent>
        <view class="filter-mask" @tap="closeHistoryFilter" />
        <view class="filter-panel">
        <view class="filter-header">
          <button class="filter-close" aria-label="关闭筛选" @tap="closeHistoryFilter">∨</button>
          <view class="filter-title">筛选</view>
          <view class="filter-header-spacer" />
        </view>
        <view class="filter-section">
          <view class="filter-section-title">体裁</view>
          <view class="filter-chips">
            <button
              v-for="item in formatOptions"
              :key="item.id"
              class="filter-chip"
              :class="{ active: draftSheetFilter.format === item.id }"
              @tap="selectDraftFormat(item.id)"
            >
              {{ item.label }}
            </button>
          </view>
        </view>
        <view class="filter-section">
          <view class="filter-section-title">已播放时长</view>
          <view class="filter-chips">
            <button
              v-for="item in durationOptions"
              :key="item.id"
              class="filter-chip"
              :class="{ active: draftSheetFilter.duration === item.id }"
              @tap="selectDraftDuration(item.id)"
            >
              {{ item.label }}
            </button>
          </view>
        </view>
        <view class="filter-section">
          <view class="filter-section-title">时间</view>
          <view class="filter-chips">
            <button
              v-for="item in timeOptions"
              :key="item.id"
              class="filter-chip"
              :class="{ active: draftSheetFilter.time === item.id }"
              @tap="selectDraftTime(item.id)"
            >
              {{ item.label }}
            </button>
          </view>
        </view>
        <view class="filter-footer">
          <button class="filter-clear" @tap="clearDraftHistoryFilter">清空</button>
          <button class="filter-confirm" @tap="confirmHistoryFilter">确定</button>
        </view>
      </view>
      </view>
    </root-portal>
  </view>

<style>
page {
  background: #f7f7f8;
  color: #16161a;
}
.filter-root {
  position: fixed;
  z-index: 1000;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.filter-mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.46);
}
</style>
<style scoped src="../../styles/my.scss"></style>
