<script setup lang="ts">
import { DramaStatus, MediaStatus } from "@microfocus/contracts";
import { ElDrawer as ElementDrawer } from "element-plus";
import { computed, ref, watch, type Component } from "vue";
import Icon from "@/components/Icon.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { dramaStatusLabels, formatDateTime, formatDuration, mediaStatusLabels } from "@/i18n";
import type { DramaRecord } from "@/types/admin";

const ElDrawer = ElementDrawer as Component;

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
      <div class="drama-detail-header">
        <div class="drama-detail-header__copy">
          <h2>剧目详情</h2>
          <div v-if="drama" class="drama-detail-header__meta">
            <strong>{{ drama.title || "未命名剧目" }}</strong>
            <StatusBadge :label="statusLabel(drama.status)" :tone="dramaStatusTone(drama.status)" />
            <span>{{ drama.ownerName || "未分配负责人" }}</span>
          </div>
          <p v-else>只读模式</p>
        </div>
        <RouterLink v-if="drama" class="button button--primary" :to="`/dramas/${drama.id}`">
          编辑剧目
        </RouterLink>
      </div>
    </template>

    <PageState v-if="loading" type="loading" message="正在读取剧目详情…" />
    <PageState v-else-if="error" type="error" :message="error" @retry="emit('retry')" />
    <PageState v-else-if="!drama" type="empty" title="暂无剧目资料" message="关闭抽屉后重新选择一条剧目。" />
    <div v-else class="drama-detail-content">
      <section class="drama-detail-section drama-detail-overview" aria-labelledby="drama-detail-overview-title">
        <div class="drama-detail-overview__media">
          <img
            v-if="drama.coverUrl && !coverFailed"
            :src="drama.coverUrl"
            :alt="`${drama.title || '剧目'}海报`"
            @error="coverFailed = true"
          />
          <div v-else class="drama-detail-overview__placeholder" aria-label="暂无海报">
            <Icon name="empty" :size="24" />
            <span>暂无海报</span>
          </div>
        </div>
        <div class="drama-detail-overview__copy">
          <p class="eyebrow">CONTENT DETAIL</p>
          <h3 id="drama-detail-overview-title">{{ drama.title || "未命名剧目" }}</h3>
          <p class="drama-detail-overview__summary">{{ drama.summary || "暂无简介" }}</p>
          <div class="drama-detail-tags" aria-label="剧目标签">
            <span v-if="drama.category" class="drama-detail-tag">{{ drama.category }}</span>
            <span v-for="tag in drama.tags" :key="tag" class="drama-detail-tag">{{ tag }}</span>
            <span v-if="!drama.category && !drama.tags.length" class="drama-detail-empty">暂无标签</span>
          </div>
        </div>
      </section>

      <section class="drama-detail-section" aria-labelledby="drama-detail-basic-title">
        <div class="drama-detail-section__heading">
          <div>
            <p class="eyebrow">METADATA</p>
            <h3 id="drama-detail-basic-title">基础信息</h3>
          </div>
        </div>
        <dl class="drama-detail-grid">
          <div><dt>负责人</dt><dd>{{ display(drama.ownerName) }}</dd></div>
          <div><dt>内容状态</dt><dd><StatusBadge :label="statusLabel(drama.status)" :tone="dramaStatusTone(drama.status)" /></dd></div>
          <div><dt>剧集数量</dt><dd>{{ episodes.length }} 集</dd></div>
          <div><dt>最后更新</dt><dd>{{ formatDateTime(drama.updatedAt) }}</dd></div>
        </dl>
      </section>

      <section class="drama-detail-section" aria-labelledby="drama-detail-rights-title">
        <div class="drama-detail-section__heading">
          <div>
            <p class="eyebrow">RIGHTS & LICENSE</p>
            <h3 id="drama-detail-rights-title">版权与许可</h3>
          </div>
          <StatusBadge :label="rightsFilled ? '资料已填写' : '待补齐'" :tone="rightsFilled ? 'success' : 'warning'" />
        </div>
        <dl class="drama-detail-grid">
          <div><dt>权利方</dt><dd>{{ display(drama.rightsHolder) }}</dd></div>
          <div><dt>许可 / 备案编号</dt><dd>{{ display(drama.licenseNumber) }}</dd></div>
          <div><dt>许可起始日</dt><dd>{{ display(drama.rightsValidFrom) }}</dd></div>
          <div><dt>许可到期日</dt><dd>{{ display(drama.licenseExpiresAt) }}</dd></div>
          <div><dt>报备号</dt><dd>{{ display(drama.rightsReportNumber) }}</dd></div>
          <div><dt>版权材料</dt><dd>{{ materialSubmitted ? "已提交（原始信息隐藏）" : "未提交" }}</dd></div>
        </dl>
        <div class="drama-detail-permissions" aria-label="授权范围">
          <div v-for="item in permissionItems" :key="item.label" class="drama-detail-permission">
            <span class="drama-detail-check" :class="{ 'is-ready': item.allowed }" aria-hidden="true">
              <Icon :name="item.allowed ? 'check' : 'close'" :size="14" />
            </span>
            <span>{{ item.label }}</span>
            <StatusBadge :label="item.allowed ? '已授权' : '未授权'" :tone="item.allowed ? 'success' : 'warning'" />
          </div>
        </div>
      </section>

      <section class="drama-detail-section" aria-labelledby="drama-detail-episodes-title">
        <div class="drama-detail-section__heading">
          <div>
            <p class="eyebrow">EPISODES & VOD</p>
            <h3 id="drama-detail-episodes-title">剧集与媒体</h3>
          </div>
          <span class="drama-detail-section__summary">{{ episodes.length }} 集 · {{ readyEpisodeCount }} 集媒体就绪</span>
        </div>
        <div v-if="episodes.length" class="drama-detail-table-wrap">
          <table class="drama-detail-episodes">
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
        <div v-else class="drama-detail-empty-state">
          <Icon name="empty" :size="20" />
          <span>尚未添加剧集</span>
        </div>
      </section>

      <section class="drama-detail-section" aria-labelledby="drama-detail-release-title">
        <div class="drama-detail-section__heading">
          <div>
            <p class="eyebrow">RELEASE STATUS</p>
            <h3 id="drama-detail-release-title">发布状态</h3>
          </div>
          <StatusBadge :label="statusLabel(drama.status)" :tone="dramaStatusTone(drama.status)" />
        </div>
        <ul class="drama-detail-review-list">
          <li v-for="item in reviewItems" :key="item.label">
            <span class="drama-detail-check" :class="{ 'is-ready': item.approved }" aria-hidden="true">
              <Icon :name="item.approved ? 'check' : 'close'" :size="14" />
            </span>
            <span>{{ item.label }}</span>
            <strong>{{ item.approved ? "已通过" : "待处理" }}</strong>
          </li>
        </ul>
        <p class="drama-detail-note">发布和下架操作请进入编辑页，并由服务端再次校验权限与发布闸门。</p>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.drama-detail-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.drama-detail-drawer :deep(.el-drawer__body) {
  padding: 0;
}
.drama-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
}
.drama-detail-header__copy {
  min-width: 0;
}
.drama-detail-header h2 {
  margin: 0 0 var(--space-2);
  color: var(--text-color);
  font-size: 20px;
  line-height: 1.25;
}
.drama-detail-header__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--color-muted);
  font-size: 12px;
}
.drama-detail-header__meta strong {
  color: var(--text-color);
  font-size: 14px;
}
.drama-detail-header__copy > p {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
}
.drama-detail-header .button {
  flex: 0 0 auto;
  white-space: nowrap;
}
.drama-detail-content {
  padding: 0 var(--space-4) var(--space-4);
}
.drama-detail-section {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-border);
}
.drama-detail-section:last-child {
  border-bottom: 0;
}
.drama-detail-section__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.drama-detail-section__heading h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.35;
}
.drama-detail-section__summary {
  flex: 0 0 auto;
  color: var(--color-muted);
  font-size: 12px;
}
.drama-detail-overview {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-4);
}
.drama-detail-overview__media {
  display: grid;
  width: 88px;
  height: 116px;
  flex: 0 0 88px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-muted);
  background: var(--color-surface-soft);
}
.drama-detail-overview__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.drama-detail-overview__placeholder {
  display: grid;
  place-items: center;
  gap: var(--space-1);
  font-size: 11px;
}
.drama-detail-overview__copy {
  min-width: 0;
}
.drama-detail-overview__copy h3 {
  margin: 0 0 var(--space-2);
  color: var(--text-color);
  font-size: 18px;
  line-height: 1.3;
}
.drama-detail-overview__summary {
  margin: 0 0 var(--space-2);
  color: var(--color-muted);
  line-height: 1.65;
}
.drama-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.drama-detail-tag {
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  font-size: 11px;
}
.drama-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}
.drama-detail-grid > div {
  min-width: 0;
}
.drama-detail-grid dt {
  margin-bottom: var(--space-1);
  color: var(--color-muted);
  font-size: 12px;
}
.drama-detail-grid dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
}
.drama-detail-permissions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-soft);
}
.drama-detail-permission,
.drama-detail-review-list li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.drama-detail-permission > span:nth-child(2),
.drama-detail-review-list li > span:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.drama-detail-check {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  place-items: center;
  border-radius: 50%;
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.drama-detail-check.is-ready {
  color: var(--color-success);
  background: var(--color-success-soft);
}
.drama-detail-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.drama-detail-episodes {
  width: 100%;
  min-width: 460px;
  border-collapse: collapse;
  table-layout: fixed;
}
.drama-detail-episodes th,
.drama-detail-episodes td {
  padding: 10px var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  font-size: 12px;
  font-weight: 500;
}
.drama-detail-episodes th {
  color: var(--text-color);
  background: var(--table-head-bg-color);
}
.drama-detail-episodes td {
  color: var(--color-muted);
}
.drama-detail-episodes tbody tr:last-child td {
  border-bottom: 0;
}
.drama-detail-episodes th:first-child,
.drama-detail-episodes td:first-child {
  width: 56px;
}
.drama-detail-episodes th:nth-child(3),
.drama-detail-episodes td:nth-child(3) {
  width: 84px;
}
.drama-detail-episodes th:last-child,
.drama-detail-episodes td:last-child {
  width: 100px;
}
.drama-detail-empty,
.drama-detail-empty-state {
  color: var(--color-muted);
  font-size: 12px;
}
.drama-detail-empty-state {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}
.drama-detail-review-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.drama-detail-review-list li {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.drama-detail-review-list li:last-child {
  border-bottom: 0;
}
.drama-detail-review-list strong {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 500;
}
.drama-detail-note {
  margin: var(--space-3) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid #cbd8ea;
  border-radius: 8px;
  color: #31537a;
  background: #f0f6fc;
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 560px) {
  .drama-detail-header {
    align-items: stretch;
    flex-direction: column;
  }
  .drama-detail-header .button {
    width: 100%;
  }
  .drama-detail-grid,
  .drama-detail-permissions {
    grid-template-columns: 1fr;
  }
}
</style>
