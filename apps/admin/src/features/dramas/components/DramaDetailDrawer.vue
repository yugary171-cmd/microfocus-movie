<script setup lang="ts">
import { DramaStatus, MediaStatus } from "@microfocus/contracts";
import { ElButton as ElementButton, ElDrawer as ElementDrawer } from "element-plus";
import { computed, ref, watch, type Component } from "vue";
import { Icon, PageState, StatusBadge } from "@/shared/components";
import { dramaStatusLabels, mediaStatusLabels } from "@/shared/constants/labels";
import { formatDateTime, formatDuration } from "@/shared/utils/format";
import type { DramaRecord } from "@/shared/types";

const ElDrawer = ElementDrawer as Component;
const ElButton = ElementButton as Component;

const props = withDefaults(
  defineProps<{
    open: boolean;
    drama: DramaRecord | null;
    loading?: boolean;
    error?: string;
  }>(),
  {
    loading: false,
    error: "",
  },
);

const emit = defineEmits<{
  close: [];
  retry: [];
}>();

const drawerOpen = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) emit("close");
  },
});

const coverFailed = ref(false);

watch(
  () => props.drama?.coverUrl,
  () => {
    coverFailed.value = false;
  },
);

const episodes = computed(() =>
  Array.isArray(props.drama?.episodes)
    ? [...props.drama.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
    : [],
);

const readyEpisodeCount = computed(
  () => episodes.value.filter((episode) => episode.mediaStatus === MediaStatus.READY).length,
);

const permissionItems = computed(() => {
  const drama = props.drama;
  return [
    { label: "微信分发", allowed: drama?.allowsWechatDistribution === true },
    { label: "广告变现", allowed: drama?.allowsAdMonetization === true },
    { label: "媒体转码", allowed: drama?.allowsTranscoding === true },
    { label: "宣传材料", allowed: drama?.allowsPromotionalMaterial === true },
  ];
});

const reviewItems = computed(() => {
  const drama = props.drama;
  return [
    { label: "内容审核", approved: drama?.contentApproved === true },
    { label: "版权核验", approved: drama?.copyrightVerified === true },
    { label: "微信审核", approved: drama?.wechatApproved === true },
  ];
});

const rightsFilled = computed(() => Boolean(props.drama?.rightsHolder?.trim() && props.drama?.licenseNumber?.trim()));
const materialSubmitted = computed(() => Boolean(props.drama?.rightsMaterialObjectKey?.trim() || props.drama?.rightsMaterialDigestSha256?.trim()));

function dramaStatusTone(status: DramaStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  if (status === DramaStatus.PUBLISHED || status === DramaStatus.READY) return "success";
  if (status === DramaStatus.OFFLINE) return "danger";
  if (status === DramaStatus.UPLOADING || status === DramaStatus.PROCESSING) return "info";
  if (status === DramaStatus.PENDING_REVIEW || status === DramaStatus.PENDING_WECHAT) return "warning";
  return "neutral";
}

function mediaStatusTone(status: MediaStatus): "neutral" | "info" | "warning" | "success" | "danger" {
  if (status === MediaStatus.READY) return "success";
  if (status === MediaStatus.FAILED || status === MediaStatus.REVIEW_REJECTED) return "danger";
  if (status === MediaStatus.CREATED) return "neutral";
  if (status === MediaStatus.PENDING_MANUAL_REVIEW || status === MediaStatus.PENDING_WECHAT) return "warning";
  return "info";
}

function display(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function statusLabel(status: DramaStatus): string {
  return dramaStatusLabels[status] ?? "未知状态";
}

function mediaLabel(status: MediaStatus): string {
  return mediaStatusLabels[status] ?? "未知状态";
}
</script>

<template>
  <el-drawer
    v-model="drawerOpen"
    class="drama-detail-drawer"
    direction="rtl"
    size="min(720px, 92vw)"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
  >
    <template #header>
      <div data-testid="drama-detail-header" :class="$style['drama-detail-header']">
        <h2>剧目详情</h2>
      </div>
    </template>

    <PageState v-if="loading" type="loading" message="正在读取剧目详情…" />
    <PageState v-else-if="error" type="error" :message="error" @retry="emit('retry')" />
    <PageState v-else-if="!drama" type="empty" title="暂无剧目资料" message="关闭抽屉后重新选择一条剧目。" />
    <div v-else :class="$style['drama-detail-content']">
      <section :class="[$style['drama-detail-section'], $style['drama-detail-overview']]" aria-labelledby="drama-detail-overview-title">
        <div :class="$style['drama-detail-overview__media']">
          <img
            v-if="drama.coverUrl && !coverFailed"
            :src="drama.coverUrl"
            :alt="`${drama.title || '剧目'}海报`"
            @error="coverFailed = true"
          />
          <div v-else :class="$style['drama-detail-overview__placeholder']" aria-label="暂无海报">
            <Icon name="empty" :size="24" />
            <span>暂无海报</span>
          </div>
        </div>
        <div :class="$style['drama-detail-overview__copy']">
          <p class="eyebrow">CONTENT DETAIL</p>
          <h3 id="drama-detail-overview-title">{{ drama.title || "未命名剧目" }}</h3>
          <p :class="$style['drama-detail-overview__summary']">{{ drama.summary || "暂无简介" }}</p>
          <div :class="$style['drama-detail-tags']" aria-label="剧目标签">
            <span v-if="drama.category" :class="$style['drama-detail-tag']">{{ drama.category }}</span>
            <span v-for="tag in drama.tags" :key="tag" :class="$style['drama-detail-tag']">{{ tag }}</span>
            <span v-if="!drama.category && !drama.tags.length" :class="$style['drama-detail-empty']">暂无标签</span>
          </div>
        </div>
      </section>

      <section :class="$style['drama-detail-section']" aria-labelledby="drama-detail-basic-title">
        <div :class="$style['drama-detail-section__heading']">
          <div>
            <p class="eyebrow">METADATA</p>
            <h3 id="drama-detail-basic-title">基础信息</h3>
          </div>
        </div>
        <dl :class="$style['drama-detail-grid']">
          <div><dt>负责人</dt><dd>{{ display(drama.ownerName) }}</dd></div>
          <div><dt>内容状态</dt><dd><StatusBadge :label="statusLabel(drama.status)" :tone="dramaStatusTone(drama.status)" /></dd></div>
          <div><dt>剧集数量</dt><dd>{{ episodes.length }} 集</dd></div>
          <div><dt>最后更新</dt><dd>{{ formatDateTime(drama.updatedAt) }}</dd></div>
        </dl>
      </section>

      <section :class="$style['drama-detail-section']" aria-labelledby="drama-detail-rights-title">
        <div :class="$style['drama-detail-section__heading']">
          <div>
            <p class="eyebrow">RIGHTS & LICENSE</p>
            <h3 id="drama-detail-rights-title">版权与许可</h3>
          </div>
          <StatusBadge :label="rightsFilled ? '资料已填写' : '待补齐'" :tone="rightsFilled ? 'success' : 'warning'" />
        </div>
        <dl :class="$style['drama-detail-grid']">
          <div><dt>权利方</dt><dd>{{ display(drama.rightsHolder) }}</dd></div>
          <div><dt>许可 / 备案编号</dt><dd>{{ display(drama.licenseNumber) }}</dd></div>
          <div><dt>许可起始日</dt><dd>{{ display(drama.rightsValidFrom) }}</dd></div>
          <div><dt>许可到期日</dt><dd>{{ display(drama.licenseExpiresAt) }}</dd></div>
          <div><dt>报备号</dt><dd>{{ display(drama.rightsReportNumber) }}</dd></div>
          <div><dt>版权材料</dt><dd>{{ materialSubmitted ? "已提交（原始信息隐藏）" : "未提交" }}</dd></div>
        </dl>
        <div :class="$style['drama-detail-permissions']" aria-label="授权范围">
          <div v-for="item in permissionItems" :key="item.label" :class="$style['drama-detail-permission']">
            <span :class="[$style['drama-detail-check'], item.allowed ? $style['is-ready'] : '']" aria-hidden="true">
              <Icon :name="item.allowed ? 'check' : 'close'" :size="14" />
            </span>
            <span>{{ item.label }}</span>
            <StatusBadge :label="item.allowed ? '已授权' : '未授权'" :tone="item.allowed ? 'success' : 'warning'" />
          </div>
        </div>
      </section>

      <section :class="$style['drama-detail-section']" aria-labelledby="drama-detail-episodes-title">
        <div :class="$style['drama-detail-section__heading']">
          <div>
            <p class="eyebrow">EPISODES & VOD</p>
            <h3 id="drama-detail-episodes-title">剧集与媒体</h3>
          </div>
          <span :class="$style['drama-detail-section__summary']">{{ episodes.length }} 集 · {{ readyEpisodeCount }} 集媒体就绪</span>
        </div>
        <div v-if="episodes.length" :class="$style['drama-detail-table-wrap']">
          <table :class="$style['drama-detail-episodes']">
            <thead><tr><th>集数</th><th>标题</th><th>时长</th><th>媒体状态</th></tr></thead>
            <tbody>
              <tr v-for="episode in episodes" :key="episode.id">
                <td>{{ String(episode.episodeNumber).padStart(2, "0") }}</td>
                <td>{{ episode.title || `第 ${episode.episodeNumber} 集` }}</td>
                <td>{{ formatDuration(episode.durationSeconds) }}</td>
                <td><StatusBadge :label="mediaLabel(episode.mediaStatus)" :tone="mediaStatusTone(episode.mediaStatus)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else :class="$style['drama-detail-empty-state']">
          <Icon name="empty" :size="20" />
          <span>尚未添加剧集</span>
        </div>
      </section>

      <section :class="$style['drama-detail-section']" aria-labelledby="drama-detail-release-title">
        <div :class="$style['drama-detail-section__heading']">
          <div>
            <p class="eyebrow">RELEASE STATUS</p>
            <h3 id="drama-detail-release-title">发布状态</h3>
          </div>
          <StatusBadge :label="statusLabel(drama.status)" :tone="dramaStatusTone(drama.status)" />
        </div>
        <ul :class="$style['drama-detail-review-list']">
          <li v-for="item in reviewItems" :key="item.label">
            <span :class="[$style['drama-detail-check'], item.approved ? $style['is-ready'] : '']" aria-hidden="true">
              <Icon :name="item.approved ? 'check' : 'close'" :size="14" />
            </span>
            <span>{{ item.label }}</span>
            <strong>{{ item.approved ? "已通过" : "待处理" }}</strong>
          </li>
        </ul>
        <p :class="$style['drama-detail-note']">发布和下架操作请进入编辑页，并由服务端再次校验权限与发布闸门。</p>
      </section>
    </div>

    <template #footer>
      <div data-testid="drama-detail-footer" :class="$style['drama-detail-footer']">
        <RouterLink v-if="drama" class="button button--primary" :to="`/dramas/${drama.id}`">
          编辑剧目
        </RouterLink>
        <el-button class="button button--secondary" native-type="button" @click="emit('close')">关闭</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style module lang="scss" src="./DramaDetailDrawer.module.scss"></style>
