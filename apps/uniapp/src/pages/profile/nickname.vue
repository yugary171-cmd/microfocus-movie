<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref, watch } from "vue";
import { saveProfile, getStoredSession } from "../../services/api";
import { toFriendlyErrorMessage } from "../../utils/errors";
import { boundNickname, canSaveNickname, clipNicknameInput, NICKNAME_MAX_LENGTH } from "../../utils/profile";

const original = ref("");
const nickname = ref("");
const count = computed(() => Array.from(nickname.value).length);
const canSave = computed(() => canSaveNickname(original.value, nickname.value));

watch(nickname, (value) => {
  const next = clipNicknameInput(value);
  if (next !== value) nickname.value = next;
});

onShow(() => {
  const session = getStoredSession();
  if (!session) {
    uni.navigateBack();
    return;
  }
  original.value = session.user.displayName || "";
  nickname.value = clipNicknameInput(original.value);
});

function clear() {
  nickname.value = "";
}

function goBack() {
  uni.navigateBack();
}

async function save() {
  if (!canSave.value) return;
  try {
    await saveProfile({ displayName: boundNickname(nickname.value) });
    uni.navigateBack();
  } catch (error) {
    uni.showToast({ title: toFriendlyErrorMessage(error), icon: "none" });
  }
}
</script>

<template>
  <view class="editor-page">
    <view class="editor-nav">
      <button class="editor-back" hover-class="none" aria-label="返回" @tap="goBack">‹</button>
      <text class="editor-title">昵称</text>
      <button class="editor-save" :class="{ disabled: !canSave }" hover-class="none" @tap="save">保存</button>
    </view>
    <view class="field">
      <input v-model="nickname" :maxlength="NICKNAME_MAX_LENGTH" placeholder="请输入昵称" />
      <view class="field-meta">
      <button v-if="nickname" class="clear" hover-class="none" aria-label="清空" @tap="clear"><image src="/static/icons/weui-close.svg" mode="aspectFit" aria-hidden="true" /></button>
        <text>{{ count }}/{{ NICKNAME_MAX_LENGTH }}</text>
      </view>
    </view>
    <view class="hint">昵称请填写1-{{ NICKNAME_MAX_LENGTH }}个字符</view>
  </view>
</template>

<style>
page {
  background: #000;
  color: #fff;
}
</style>
<style scoped src="../../styles/profile.scss"></style>
