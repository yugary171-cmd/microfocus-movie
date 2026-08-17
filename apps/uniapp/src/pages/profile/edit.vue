<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { wechatMiniprogramAuthSupported } from "../../platform";
import { getStoredSession, loadProfile, saveProfile } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import {
  formatMicrofocusId,
  GENDER_OPTIONS,
  genderDisplayLabel,
  type ProfileGender
} from "../../utils/profile";

const displayName = ref("");
const avatarUrl = ref("");
const microfocusId = ref("");
const signature = ref("");
const gender = ref<ProfileGender>("unset");
const genderDraft = ref<ProfileGender>("unset");
const genderOpen = ref(false);
const saving = ref(false);

const initial = computed(() => displayName.value.slice(0, 1) || "微");
const genderText = computed(() => genderDisplayLabel(gender.value));
const signatureText = computed(() => signature.value.trim() || "介绍一下自己");

function applyUser(user: { displayName: string; avatarUrl: string | null; id: string; signature: string; gender: ProfileGender }) {
  displayName.value = user.displayName || "微信用户";
  avatarUrl.value = user.avatarUrl || "";
  microfocusId.value = formatMicrofocusId(user.id);
  signature.value = user.signature;
  gender.value = user.gender;
}

async function refresh() {
  const session = getStoredSession();
  if (!session) {
    uni.navigateBack();
    return;
  }
    applyUser(session.user);
  try {
    const user = await loadProfile();
    if (user) applyUser(user);
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  }
}

onShow(() => {
  void refresh();
});

async function persistAvatar(nextUrl: string) {
  if (!nextUrl || saving.value) return;
  saving.value = true;
  try {
    const stored = await saveProfile({ avatarUrl: nextUrl });
    avatarUrl.value = stored?.user.avatarUrl || nextUrl;
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  } finally {
    saving.value = false;
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

function openNickname() {
  uni.navigateTo({ url: "/pages/profile/nickname" });
}

function openSignature() {
  uni.navigateTo({ url: "/pages/profile/signature" });
}

function openGender() {
  genderDraft.value = gender.value;
  genderOpen.value = true;
}

function closeGender() {
  genderOpen.value = false;
}

async function saveGender() {
  if (saving.value) return;
  saving.value = true;
  try {
    const stored = await saveProfile({ gender: genderDraft.value });
    gender.value = stored?.user.gender ?? genderDraft.value;
    genderOpen.value = false;
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <view class="profile-page">
    <view class="avatar-wrap">
      <button
        class="avatar-button"
        hover-class="none"
        open-type="chooseAvatar"
        aria-label="修改头像"
        @chooseavatar="onChooseAvatar"
        @tap="onAvatarTap"
      >
        <view class="avatar-face">
          <image v-if="avatarUrl" :src="avatarUrl" mode="aspectFill" />
          <text v-else>{{ initial }}</text>
        </view>
        <view class="camera-badge">更换</view>
      </button>
    </view>

    <view class="card">
      <view class="row" @tap="openNickname">
        <text class="row-label">昵称</text>
        <text class="row-value">{{ displayName }}</text>
        <image class="row-arrow" src="/static/icons/weui-arrow-right.svg" mode="aspectFit" aria-hidden="true" />
      </view>
      <view class="row">
        <text class="row-label">微焦号</text>
        <text class="row-value">{{ microfocusId }}</text>
      </view>
    </view>

    <view class="card">
      <view class="row" @tap="openSignature">
        <text class="row-label">个人签名</text>
        <text class="row-value" :class="{ placeholder: !signature.trim() }">{{ signatureText }}</text>
        <image class="row-arrow" src="/static/icons/weui-arrow-right.svg" mode="aspectFit" aria-hidden="true" />
      </view>
      <view class="row" @tap="openGender">
        <text class="row-label">性别</text>
        <text class="row-value" :class="{ placeholder: gender === 'unset' }">{{ genderText }}</text>
        <image class="row-arrow" src="/static/icons/weui-arrow-right.svg" mode="aspectFit" aria-hidden="true" />
      </view>
    </view>

    <view class="footnote">个人信息不用于个性化推荐，仅丰富主页内容</view>

    <view v-if="genderOpen" class="sheet-mask" @tap="closeGender">
      <view class="sheet" @tap.stop>
        <view class="sheet-head">
          <button class="sheet-close" hover-class="none" aria-label="关闭" @tap="closeGender"><image src="/static/icons/weui-close.svg" mode="aspectFit" aria-hidden="true" /></button>
          <text class="sheet-title">选择性别</text>
          <button class="sheet-save" hover-class="none" :disabled="saving" @tap="saveGender">保存</button>
        </view>
        <view
          v-for="option in GENDER_OPTIONS"
          :key="option.id"
          class="sheet-option"
          :class="{ active: genderDraft === option.id }"
          @tap="genderDraft = option.id"
        >
          <text>{{ option.label }}</text>
        <image v-if="genderDraft === option.id" class="sheet-check" src="/static/icons/weui-check.svg" mode="aspectFit" aria-hidden="true" />
        </view>
      </view>
    </view>
  </view>
</template>

<style>
page {
  background: #000;
  color: #fff;
}
</style>
<style scoped src="../../styles/profile.scss"></style>
