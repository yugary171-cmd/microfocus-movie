<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref, watch } from "vue";
import { getStoredSession, saveProfile } from "@/shared/api";
import { toFriendlyErrorMessage } from "@/shared/utils";
import { boundSignature, canSaveSignature, SIGNATURE_MAX_LENGTH } from "@/features/profile";

const original = ref("");
const signature = ref("");
const count = computed(() => Array.from(signature.value).length);
const canSave = computed(() => canSaveSignature(original.value, signature.value));

watch(signature, (value) => {
  const next = boundSignature(value);
  if (next !== value) signature.value = next;
});

onShow(() => {
  if (!getStoredSession()) {
    uni.navigateBack();
    return;
  }
  original.value = getStoredSession()?.user.signature ?? "";
  signature.value = original.value;
});

function goBack() {
  uni.navigateBack();
}

async function save() {
  if (!canSave.value) return;
  try {
    await saveProfile({ signature: boundSignature(signature.value) });
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
      <text class="editor-title">个人签名</text>
      <button class="editor-save" :class="{ disabled: !canSave }" hover-class="none" @tap="save">保存</button>
    </view>
    <view class="textarea-box">
      <textarea
        v-model="signature"
        :maxlength="SIGNATURE_MAX_LENGTH"
        placeholder="介绍一下自己"
      />
      <view class="counter">{{ count }}/{{ SIGNATURE_MAX_LENGTH }}</view>
    </view>
    <view class="hint">个人签名最多支持{{ SIGNATURE_MAX_LENGTH }}个字符</view>
  </view>
</template>

<style>
page {
  background: #000;
  color: #fff;
}
</style>
<style scoped src="../../styles/profile.scss"></style>
