<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { NAV_ICONS } from "@/shared/constants";
import { wechatMiniprogramAuthSupported } from "../../platform";
import {
  ensureSession,
  getApi,
  getStoredSession,
  isMockMode,
  saveProfile
} from "@/shared/api";
import { toFriendlyErrorMessage } from "@/shared/utils";
import { getMockHistoryCards } from "@/mocks/history-state";
import { loadFavoriteCards, loadLikedDramaCards, resolveHistoryPlayerUrl, toHistoryCardViews, type HistoryCardView } from "@/features/library";
import { loadInboxItems } from "@/features/inbox";
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
} from "@/features/library";
import {
  FAVORITE_TAB,
  INBOX_MOCK_LABEL,
  INBOX_TAB,
  LIBRARY_EDIT_COPY,
  LIBRARY_TABS,
  LIKE_TAB,
  cloneInboxItems,
  isFormatLibraryTab,
  parseLibraryGridTab
} from "@/features/inbox";

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
const activeFormat = ref<HistoryFormatId>("all");
const historyItems = ref<HistoryCardView[]>(isMock ? getMockHistoryCards() : []);
const favoriteItems = ref<HistoryCardView[]>([]);
const likeItems = ref<HistoryCardView[]>([]);
const followingCount = ref(0);
const followerCount = ref(0);
const receivedLikeCount = ref(0);
const inboxItems = ref(cloneInboxItems());
const filterOpen = ref(false);
const appliedSheetFilter = ref<HistorySheetFilter>(cloneHistorySheetFilter());
const draftSheetFilter = ref<HistorySheetFilter>(cloneHistorySheetFilter());
const formatOptions = HISTORY_FORMAT_OPTIONS;
const durationOptions = HISTORY_DURATION_OPTIONS;
const timeOptions = HISTORY_TIME_OPTIONS;
const historySearchOpen = ref(false);
const historyQuery = ref("");
const queryMaxLength = LIST_QUERY_MAX_LENGTH;
function openSystemNotifications() {
  uni.navigateTo({ url: "/pages/notifications/index" });
}
const sheetFilterActive = computed(() => !isDefaultHistorySheetFilter(appliedSheetFilter.value));
const isFormatTab = computed(() => isFormatLibraryTab(activeHistoryTab.value));
const sourceItems = computed(() => {
  if (activeHistoryTab.value === FAVORITE_TAB) return favoriteItems.value;
  if (activeHistoryTab.value === LIKE_TAB) return likeItems.value;
  return historyItems.value;
});
const libraryCopy = computed(() => LIBRARY_EDIT_COPY[parseLibraryGridTab(activeHistoryTab.value)]);
const visibleHistoryItems = computed(() =>
  filterHistoryItems(sourceItems.value, {
    completion: isFormatTab.value ? "全部" : activeFilter.value,
    sheet: isFormatTab.value
      ? { format: activeFormat.value, duration: "all", time: "all" }
      : appliedSheetFilter.value,
    query: historyQuery.value
  })
);

async function loadLibrary() {
  historyLoading.value = true;
  historyError.value = "";
  try {
    const [history, favorites, likes] = await Promise.all([
      isMock || user.value ? getApi().getHistory() : Promise.resolve([]),
      isMock || user.value ? loadFavoriteCards() : Promise.resolve([]),
      isMock || user.value ? loadLikedDramaCards() : Promise.resolve([])
    ]);
    historyItems.value = toHistoryCardViews(history);
    favoriteItems.value = favorites;
    likeItems.value = likes;
    const session = getStoredSession();
    if (session?.user.id) {
      const [profile, inbox] = await Promise.all([
        getApi().social.getUser(session.user.id),
        loadInboxItems()
      ]);
      followingCount.value = profile.followingCount;
      followerCount.value = profile.followerCount;
      receivedLikeCount.value = profile.receivedCommentLikeCount;
      inboxItems.value = inbox;
    } else {
      inboxItems.value = cloneInboxItems();
    }
  } catch (error) {
    historyError.value = toFriendlyErrorMessage(error);
  } finally {
    historyLoading.value = false;
  }
}

onShow(() => {
  user.value = toUserView(getStoredSession());
  if (isMock || user.value) void loadLibrary();
});

async function login() {
  if (loginLoading.value) return;
  loginError.value = "";
  try {
    loginLoading.value = true;
    const session = await ensureSession();
    user.value = toUserView(session);
    await loadLibrary();
    uni.showToast({ title: "登录成功", icon: "success" });
  } catch (error) {
    loginError.value = toFriendlyErrorMessage(error);
  } finally {
    loginLoading.value = false;
  }
}

function selectCompletionFilter(item: string) {
  if (isHistoryCompletionFilter(item)) activeFilter.value = item;
}

function selectFormatFilter(id: HistoryFormatId) {
  activeFormat.value = id;
}

function openHistoryFilter() {
  draftSheetFilter.value = cloneHistorySheetFilter(appliedSheetFilter.value);
  filterOpen.value = true;
}

function closeHistoryFilter() {
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

function openHistorySearch() {
  historySearchOpen.value = true;
}

function closeHistorySearch() {
  historySearchOpen.value = false;
  historyQuery.value = "";
}

function onHistoryQuery(event: InputEvent) {
  const raw = (event as { detail?: unknown }).detail;
  const fromDetail =
    raw && typeof raw === "object" && "value" in raw ? String((raw as { value?: unknown }).value ?? "") : "";
  historyQuery.value = fromDetail || String((event.target as HTMLInputElement | null)?.value || "");
}

function selectLibraryTab(item: (typeof LIBRARY_TABS)[number]) {
  activeHistoryTab.value = item;
  historySearchOpen.value = false;
  historyQuery.value = "";
}

function openSettings() {
  uni.navigateTo({ url: "/pages/settings/index" });
}

function openHistoryEdit() {
  uni.navigateTo({
    url: `/pages/history/edit?tab=${encodeURIComponent(activeHistoryTab.value)}`
  });
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
  const item = sourceItems.value.find((entry) => entry.id === id);
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
    </view>
    <view v-if="loginError" class="login-error" role="alert">{{ loginError }}</view>

    <view v-if="user" class="stats-row">
      <view class="stats">
        <view><strong>{{ followingCount }}</strong><text>关注</text></view>
        <view><strong>{{ followerCount }}</strong><text>粉丝</text></view>
        <view><strong>{{ receivedLikeCount }}</strong><text>获赞</text></view>
      </view>
      <button class="settings-button" aria-label="设置" @tap="openSettings">设置</button>
    </view>

    <view class="history-panel">
      <view class="history-tabs">
        <view
          v-for="item in historyTabs"
          :key="item"
          class="history-tab"
          :class="{ active: activeHistoryTab === item }"
          @tap="selectLibraryTab(item)"
        >
          {{ item }}
        </view>
        <view
          v-if="activeHistoryTab !== INBOX_TAB"
          class="history-search"
          :class="{ active: historySearchOpen }"
          aria-label="搜索历史"
          @tap="openHistorySearch"
        >
          <image :src="NAV_ICONS.search" mode="aspectFit" aria-hidden="true" />
        </view>
      </view>
      <view v-if="historySearchOpen && activeHistoryTab !== INBOX_TAB" class="history-search-bar">
        <input
          class="history-search-field"
          :value="historyQuery"
          :maxlength="queryMaxLength"
          :focus="historySearchOpen"
          confirm-type="search"
          :placeholder="libraryCopy.search"
          @input="onHistoryQuery"
        />
        <view class="history-search-cancel" hover-class="none" @tap="closeHistorySearch">取消</view>
      </view>
      <view v-if="activeHistoryTab === INBOX_TAB" class="inbox-list" aria-label="消息分类">
        <view v-if="isMock" class="mock-label">{{ INBOX_MOCK_LABEL }}</view>
        <view
          v-for="item in inboxItems"
          :key="item.id"
          class="inbox-row"
          :class="{ unread: item.unread }"
          @tap="item.id === 'system' ? openSystemNotifications() : undefined"
        >
          <view class="inbox-icon" :class="item.tone">{{ item.icon }}</view>
          <view class="inbox-copy">
            <view class="inbox-title">{{ item.title }}<text v-if="item.unread" class="inbox-unread-dot">未读</text></view>
            <view class="inbox-preview">{{ item.preview }}</view>
          </view>
          <text v-if="item.meta" class="inbox-meta">{{ item.meta }}</text>
          <image v-else class="inbox-chevron" :src="NAV_ICONS.arrowRight" mode="aspectFit" aria-hidden="true" />
        </view>
      </view>
      <view v-else>
        <view class="history-tools">
          <view v-if="!isFormatTab" class="filters">
            <view
              v-for="item in historyFilters"
              :key="item"
              class="filter"
              :class="{ active: activeFilter === item }"
              @tap="selectCompletionFilter(item)"
            >
              {{ item }}
            </view>
          </view>
          <view v-else class="filters">
            <view
              v-for="item in formatOptions"
              :key="item.id"
              class="filter"
              :class="{ active: activeFormat === item.id }"
              @tap="selectFormatFilter(item.id)"
            >
              {{ item.label }}
            </view>
          </view>
          <view class="tool-actions">
            <view
              v-if="!isFormatTab"
              class="filter-trigger"
              :class="{ active: sheetFilterActive }"
              hover-class="none"
              @tap="openHistoryFilter"
            >筛选</view>
            <view class="edit-trigger" hover-class="none" @tap="openHistoryEdit">编辑</view>
          </view>
        </view>
        <view v-if="isMock" class="mock-label">{{ libraryCopy.mockLabel }}</view>
        <view v-if="historyLoading" class="history-state">{{ libraryCopy.loading }}</view>
        <view v-else-if="historyError" class="history-state" role="alert">{{ historyError }}</view>
        <view v-else-if="!sourceItems.length" class="history-state">{{ libraryCopy.empty }}</view>
        <view v-else-if="!visibleHistoryItems.length" class="history-state">{{ historyQuery.trim() ? "没有找到相关记录" : "没有符合筛选条件的记录" }}</view>
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
  </view>

  <view v-if="filterOpen" class="filter-mask" @tap="closeHistoryFilter">
    <view class="filter-panel" @tap.stop>
      <view class="filter-header">
        <button class="filter-close" aria-label="关闭筛选" @tap.stop="closeHistoryFilter"><image :src="NAV_ICONS.close" mode="aspectFit" aria-hidden="true" /></button>
        <view class="filter-title">筛选</view>
        <view class="filter-header-spacer" />
      </view>
      <view class="filter-section">
        <view class="filter-section-title">体裁</view>
        <view class="filter-chips">
          <view
            v-for="item in formatOptions"
            :key="item.id"
            class="filter-chip"
            :class="{ active: draftSheetFilter.format === item.id }"
            @tap.stop="selectDraftFormat(item.id)"
          >
            {{ item.label }}
          </view>
        </view>
      </view>
      <view class="filter-section">
        <view class="filter-section-title">已播放时长</view>
        <view class="filter-chips">
          <view
            v-for="item in durationOptions"
            :key="item.id"
            class="filter-chip"
            :class="{ active: draftSheetFilter.duration === item.id }"
            @tap.stop="selectDraftDuration(item.id)"
          >
            {{ item.label }}
          </view>
        </view>
      </view>
      <view class="filter-section">
        <view class="filter-section-title">时间</view>
        <view class="filter-chips">
          <view
            v-for="item in timeOptions"
            :key="item.id"
            class="filter-chip"
            :class="{ active: draftSheetFilter.time === item.id }"
            @tap.stop="selectDraftTime(item.id)"
          >
            {{ item.label }}
          </view>
        </view>
      </view>
      <view class="filter-footer">
        <view class="filter-clear" @tap.stop="clearDraftHistoryFilter">清空</view>
        <view class="filter-confirm" @tap.stop="confirmHistoryFilter">确定</view>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #f7f7f8;
  color: #16161a;
  overflow-x: hidden;
}
.filter-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
}
.filter-panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 8rpx 34rpx calc(28rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
}
.filter-header {
  display: flex;
  align-items: center;
  min-height: 88rpx;
}
.filter-close,
.filter-clear {
  margin: 0;
  padding: 0;
  color: #2b2b30;
  background: transparent;
}
.filter-close {
  width: 72rpx;
  font-size: 36rpx;
  line-height: 1;
}
.filter-title {
  flex: 1;
  text-align: center;
  font-size: 32rpx;
  font-weight: 800;
}
.filter-header-spacer {
  width: 72rpx;
}
.filter-section {
  margin-top: 18rpx;
}
.filter-section-title {
  margin-bottom: 18rpx;
  font-size: 28rpx;
  font-weight: 750;
}
.filter-chips {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16rpx;
}
.filter-chip {
  margin: 0;
  padding: 18rpx 8rpx;
  color: #5d5d63;
  background: #f3f3f5;
  border-radius: 12rpx;
  font-size: 24rpx;
  text-align: center;
}
.filter-chip.active {
  color: #f28735;
  background: #fff1df;
  font-weight: 750;
}
.filter-footer {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin-top: 36rpx;
}
.filter-clear {
  font-size: 28rpx;
}
.filter-confirm {
  flex: 1;
  margin: 0;
  padding: 22rpx 0;
  color: #fff;
  background: #ff7a2f;
  border-radius: 16rpx;
  font-size: 30rpx;
  font-weight: 750;
  text-align: center;
}
</style>
<style scoped src="../../styles/my.scss"></style>
