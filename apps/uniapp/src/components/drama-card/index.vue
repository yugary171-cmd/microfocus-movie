<script setup lang="ts">
import type { DramaCard } from "@microfocus/contracts";
import { ref } from "vue";
import { resolveDirectPlaybackUrl } from "../../utils/direct-playback";
import { toFriendlyErrorMessage } from "../../utils/errors";

const props = defineProps<{
  drama?: DramaCard;
  compact?: boolean;
}>();

const opening = ref(false);

async function open() {
  if (!props.drama?.id) return;
  if (opening.value) return;
  opening.value = true;
  try {
    uni.navigateTo({ url: await resolveDirectPlaybackUrl(props.drama.id) });
  } catch (caught) {
    uni.showToast({ title: toFriendlyErrorMessage(caught), icon: "none" });
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <view
    class="card"
    :class="{ compact }"
    role="button"
    :aria-label="`播放短剧 ${drama?.title}，共 ${drama?.episodeCount} 集`"
    @tap="open"
  >
    <image
      v-if="drama?.coverUrl"
      class="cover"
      :src="drama.coverUrl"
      mode="aspectFill"
      lazy-load
      :aria-label="`${drama.title}封面`"
    />
    <view v-else class="cover placeholder" aria-hidden="true">剧</view>
    <view class="content">
      <view class="title">{{ drama?.title }}</view>
      <view class="meta">{{ drama?.category }} · {{ drama?.episodeCount }} 集</view>
      <view class="summary">{{ drama?.summary }}</view>
      <view class="tags">
        <text v-for="tag in drama?.tags || []" :key="tag" class="tag">{{ tag }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped src="../../styles/drama-card.scss"></style>
