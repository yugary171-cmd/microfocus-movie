<script setup lang="ts">
import { DELETION_CONFIRMATION } from "@microfocus/contracts";
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { clearStoredSession, ensureSession, getApi, getStoredSession, isMockMode } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { resolveHistoryPlayerUrl } from "../../utils/history-navigation";
import {
  toHistoryCardViews,
  type HistoryCardView
} from "../../utils/history-view";

const HISTORY_ITEMS: HistoryCardView[] = [
  { id: "history-1", title: "引她入室", episode: "1 集 / 58 集", tag: "真人剧", tone: "rose", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-2", title: "凤栖今朝", episode: "1 集 / 71 集", tag: "真人剧", tone: "blue", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-3", title: "春色撩撩", episode: "1 集 / 105 集", tag: "漫画", tone: "ink", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-4", title: "皇后娘娘来打工", episode: "1 集 / 80 集", tag: "真人剧", tone: "gold", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-5", title: "请君入我怀", episode: "1 集 / 60 集", tag: "真人剧", tone: "wine", dramaId: "", episodeNumber: 1, position: 0 },
  { id: "history-6", title: "苏太太高调离婚了", episode: "1 集 / 52 集", tag: "真人剧", tone: "night", dramaId: "", episodeNumber: 1, position: 0 }
];

type UserView = { displayName: string; microfocusId: string; initial: string };

function toUserView(session: ReturnType<typeof getStoredSession>): UserView | null {
  if (!session) return null;
  const name = session.user.displayName || "微信用户";
  return {
    displayName: name,
    microfocusId: `微焦号 · ${session.user.id.slice(0, 12).toUpperCase()}`,
    initial: name.slice(0, 1) || "微"
  };
}

const isMock = isMockMode();
const user = ref<UserView | null>(null);
const loginLoading = ref(false);
const loginError = ref("");
const deletionBusy = ref(false);
const deletionNotice = ref("");
const historyLoading = ref(false);
const historyError = ref("");
const activeHistoryTab = ref("历史");
const historyTabs = ["历史", "收藏", "点赞", "预约", "动态"];
const historyFilters = ["全部", "已看完", "未看完"];
const activeFilter = ref("全部");
const historyItems = ref<HistoryCardView[]>(isMock ? HISTORY_ITEMS : []);
const utilities = [
  { title: "商城", subtitle: "查看订单", icon: "商" },
  { title: "消息", subtitle: "1 条未读", icon: "信" },
  { title: "追更", subtitle: "管理追更", icon: "追" }
];

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
  loginLoading.value = true;
  loginError.value = "";
  try {
    const session = await ensureSession();
    user.value = toUserView(session);
    if (!isMock) await loadLiveHistory();
    uni.showToast({ title: "登录成功", icon: "success" });
  } catch (error) {
    loginError.value = toFriendlyErrorMessage(error);
  } finally {
    loginLoading.value = false;
  }
}

function showFeature(label: string) {
  uni.showToast({ title: `${label}为体验数据`, icon: "none" });
}

function openLegal(section: string) {
  uni.navigateTo({ url: `/pages/legal/index?section=${encodeURIComponent(section)}` });
}

async function requestDeletion() {
  if (!user.value || deletionBusy.value) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: "申请注销账号",
      content: "提交后立即退出登录，活动播放授权会被撤销，未完成广告奖励不再发放。查询进度的令牌只会显示一次。确定继续？",
      confirmText: "确认注销",
      success: (result) => resolve(Boolean(result.confirm))
    });
  });
  if (!confirmed) return;
  deletionBusy.value = true;
  deletionNotice.value = "";
  try {
    const result = await getApi().createDeletionRequest({ confirmation: DELETION_CONFIRMATION });
    if (result.deletionQueryToken) {
      uni.setStorageSync("microfocus.deletion-request", {
        deletionRequestId: result.deletionRequestId,
        deletionQueryToken: result.deletionQueryToken,
        tokenExpiresAt: result.tokenExpiresAt
      });
    }
    clearStoredSession();
    user.value = null;
    deletionNotice.value = result.deletionQueryToken
      ? `注销已受理。请保存查询令牌（只显示一次）：${result.deletionQueryToken}`
      : "注销已受理。若未看到查询令牌，请通过客服核验后查询进度。";
  } catch (error) {
    deletionNotice.value = toFriendlyErrorMessage(error);
  } finally {
    deletionBusy.value = false;
  }
}

async function lookupDeletion() {
  const stored = uni.getStorageSync("microfocus.deletion-request") as {
    deletionRequestId?: string;
    deletionQueryToken?: string;
  } | "";
  const record = stored && typeof stored === "object" ? stored : null;
  if (!record?.deletionRequestId || !record.deletionQueryToken) {
    uni.showToast({ title: "没有可查询的注销申请", icon: "none" });
    return;
  }
  try {
    const view = await getApi().getDeletionRequest(record.deletionRequestId, record.deletionQueryToken);
    uni.showToast({ title: `注销状态：${view.status}`, icon: "none" });
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  }
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
    <view class="top-actions">
      <button aria-label="夜间模式" @tap="showFeature('夜间模式')">☾</button>
      <button aria-label="更多设置" @tap="showFeature('更多设置')">☰<text class="new-dot" /></button>
    </view>

    <view v-if="!user" class="guest-profile">
      <view class="guest-copy">
        <view class="guest-title">免费短剧，尽在微焦</view>
        <view class="guest-subtitle">登录后同步观看记录与福利权益</view>
      </view>
      <button class="login-button" :loading="loginLoading" :disabled="loginLoading" @tap="login">
        {{ loginLoading ? "微信登录中…" : "立即登录" }}
      </button>
    </view>
    <view v-else class="member-profile">
      <view class="avatar">{{ user.initial }}</view>
      <view class="member-copy">
        <view class="member-name">{{ user.displayName }}</view>
        <view class="member-id">{{ user.microfocusId }} ⧉</view>
      </view>
      <button class="edit-button" @tap="showFeature('编辑资料')">编辑资料</button>
    </view>
    <view v-if="loginError" class="login-error" role="alert">{{ loginError }}</view>
    <view v-if="deletionNotice" class="login-error" role="status">{{ deletionNotice }}</view>

    <view class="privacy-actions">
      <button class="privacy-link" @tap="openLegal('privacy')">隐私政策</button>
      <button class="privacy-link" @tap="openLegal('deletion')">注销说明</button>
      <button v-if="user" class="privacy-link" :disabled="deletionBusy" @tap="requestDeletion">
        {{ deletionBusy ? "提交中…" : "申请注销" }}
      </button>
      <button class="privacy-link" @tap="lookupDeletion">查询注销进度</button>
    </view>

    <view v-if="user" class="stats">
      <view><strong>0</strong><text>关注</text></view>
      <view><strong>0</strong><text>粉丝</text></view>
      <view><strong>0</strong><text>获赞</text></view>
    </view>

    <scroll-view scroll-x enable-flex class="utility-scroll" aria-label="个人功能">
      <view class="utility-row">
        <button
          v-for="item in utilities"
          :key="item.title"
          class="utility-card"
          @tap="showFeature(item.title)"
        >
          <view class="utility-icon">{{ item.icon }}</view>
          <view class="utility-title">{{ item.title }}</view>
          <view class="utility-subtitle">{{ item.subtitle }}</view>
        </button>
      </view>
    </scroll-view>

    <view class="history-panel">
      <view class="history-tabs">
        <button
          v-for="item in historyTabs"
          :key="item"
          class="history-tab"
          :class="{ active: activeHistoryTab === item }"
          @tap="activeHistoryTab = item"
        >
          {{ item }}
        </button>
        <button class="history-search" aria-label="搜索历史" @tap="showFeature('历史搜索')">⌕</button>
      </view>
      <view class="history-tools">
        <view class="filters">
          <button
            v-for="item in historyFilters"
            :key="item"
            class="filter"
            :class="{ active: activeFilter === item }"
            @tap="activeFilter = item"
          >
            {{ item }}
          </button>
        </view>
        <view class="tool-actions">
          <button @tap="showFeature('筛选')">筛选</button>
          <button @tap="showFeature('编辑')">编辑</button>
        </view>
      </view>
      <view v-if="isMock" class="mock-label">Mock 观看记录</view>
      <view v-if="historyLoading" class="history-state">正在读取观看记录…</view>
      <view v-else-if="historyError" class="history-state" role="alert">{{ historyError }}</view>
      <view v-else-if="!historyItems.length" class="history-state">还没有观看记录</view>
      <view v-else class="history-grid">
        <button
          v-for="item in historyItems"
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
</template>

<style>
page {
  background: #f7f7f8;
  color: #16161a;
}
</style>
<style scoped src="../../styles/my.scss"></style>
