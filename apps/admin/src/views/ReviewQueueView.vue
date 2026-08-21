<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { ADMIN_LIST_PAGE_SIZE, isContentOperator, REVIEW_NOTES_MAX_LENGTH } from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { formatDateTime } from "@/i18n";
import { canReview } from "@/policies/admin";
import { useAuthStore } from "@/stores/auth";
import type { ReviewItem } from "@/types/admin";

const auth = useAuthStore();
const items = ref<ReviewItem[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(true);
const error = ref("");
const notice = ref("");
const busy = ref(false);
const selected = ref<ReviewItem | null>(null);
const dialog = reactive<{ decision: "approve" | "reject" | null }>({ decision: null });
const allowed = computed(() => Boolean(auth.user && isContentOperator(auth.user.role)));
const totalPages = computed(() => Math.ceil(total.value / ADMIN_LIST_PAGE_SIZE));

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    let result = await adminApi.listReviews(page.value);
    let nextItems = Array.isArray(result.items) ? result.items : [];
    let nextTotal = Number.isFinite(result.total) ? result.total : nextItems.length;
    const pages = Math.ceil(nextTotal / ADMIN_LIST_PAGE_SIZE);
    if (nextItems.length === 0 && nextTotal > 0 && page.value > 1 && pages >= 1 && page.value > pages) {
      page.value = pages;
      result = await adminApi.listReviews(page.value);
      nextItems = Array.isArray(result.items) ? result.items : [];
      nextTotal = Number.isFinite(result.total) ? result.total : nextItems.length;
    }
    items.value = nextItems;
    total.value = nextTotal;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

function go(next: number): void {
  page.value = next;
  void load();
}

function openDecision(item: ReviewItem, decision: "approve" | "reject"): void {
  selected.value = item;
  dialog.decision = decision;
}

function closeDialog(): void {
  dialog.decision = null;
  selected.value = null;
}

async function confirmDecision(reason: string): Promise<void> {
  if (!selected.value || !dialog.decision) return;
  busy.value = true;
  error.value = "";
  try {
    await adminApi.review(
      selected.value.dramaId,
      selected.value.id,
      dialog.decision === "approve",
      reason,
    );
    notice.value = adminApi.mode === "mock"
      ? "演示审核结论已记在本机浏览器中；刷新后已退回的剧不会再进待审队列。未提交真实内容平台。"
      : "审核结论已提交。";
    closeDialog();
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function reviewDecision(item: ReviewItem) {
  return auth.user ? canReview(auth.user, item) : { allowed: false, reason: "请先登录" };
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header">
      <div><p class="eyebrow">REVIEW WORKSPACE</p><h1>审核队列</h1><p>审核内容与版权信息；审核结论不替代媒体平台状态。</p></div>
      <button v-if="allowed" class="button button--secondary" type="button" :disabled="loading" @click="load">刷新队列</button>
    </header>
    <PageState v-if="!allowed" type="forbidden" message="当前角色不能访问审核队列。" />
    <PageState v-else-if="loading" type="loading" message="正在加载待审内容…" />
    <PageState v-else-if="error && items.length === 0 && total === 0" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" class="review-message review-message--error" role="alert">{{ error }}</div>
      <div v-if="notice" class="review-message" role="status">{{ notice }}</div>
      <div v-if="total > 0" class="list-summary">第 {{ page }} 页 · 共 {{ total }} 条待审</div>
      <PageState
        v-if="items.length === 0"
        type="empty"
        :title="total === 0 ? '审核队列已清空' : '这一页没有待审内容'"
        :message="total === 0 ? '当前没有需要处理的内容。' : '请返回上一页。'"
      />
      <div v-else class="review-list">
        <article v-for="item in items" :key="item.id" class="panel review-card">
          <div class="review-card__main">
            <div class="review-card__heading">
              <div><StatusBadge :label="item.status === 'PENDING' ? '待审核' : item.status === 'APPROVED' ? '已通过' : '已拒绝'" :tone="item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' ? 'success' : 'danger'" /><h2>{{ item.dramaTitle }}</h2></div>
              <RouterLink class="link" :to="`/dramas/${item.dramaId}`">查看完整资料 →</RouterLink>
            </div>
            <dl>
              <div><dt>提交人</dt><dd>{{ item.submitterName }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatDateTime(item.submittedAt) }}</dd></div>
              <div><dt>任务编号</dt><dd>{{ item.id }}</dd></div>
            </dl>
            <div v-if="item.riskFlags.length" class="risk-flags" role="note">
              <strong>需要关注</strong><ul><li v-for="flag in item.riskFlags" :key="flag">{{ flag }}</li></ul>
            </div>
            <div v-else class="risk-clear"><Icon name="check" />未发现自动标记的风险项，仍需人工完整复核。</div>
          </div>
          <div class="review-card__actions">
            <template v-if="reviewDecision(item).allowed">
              <button class="button button--secondary" type="button" @click="openDecision(item, 'reject')">拒绝并退回</button>
              <button class="button button--primary" type="button" @click="openDecision(item, 'approve')">审核通过</button>
            </template>
            <small v-else>{{ reviewDecision(item).reason }}</small>
          </div>
        </article>
      </div>
      <div v-if="totalPages > 1 || page > 1" class="pager">
        <button class="button button--ghost" type="button" :disabled="loading || page <= 1" @click="go(page - 1)">上一页</button>
        <button class="button button--ghost" type="button" :disabled="loading || page >= totalPages" @click="go(page + 1)">下一页</button>
      </div>
    </template>
    <ConfirmDialog
      :open="dialog.decision === 'approve'"
      title="确认审核通过"
      :message="`确认“${selected?.dramaTitle ?? ''}”内容和版权资料均符合要求？媒体状态仍将独立校验。`"
      confirm-label="确认通过"
      :busy="busy"
      @close="closeDialog"
      @confirm="confirmDecision"
    />
    <ConfirmDialog
      :open="dialog.decision === 'reject'"
      title="拒绝并退回"
      :message="`请说明“${selected?.dramaTitle ?? ''}”需要修改的具体问题。`"
      confirm-label="确认拒绝"
      tone="danger"
      require-reason
      reason-label="退回原因"
      :reason-max-length="REVIEW_NOTES_MAX_LENGTH"
      :busy="busy"
      @close="closeDialog"
      @confirm="confirmDecision"
    />
  </div>
</template>

<style scoped>
.list-summary { margin: 0 0 var(--space-2); color: var(--color-muted); font-size: 12px; }
.pager { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
.review-list { display: grid; gap: var(--space-3); }
.review-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-4); }
.review-card__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.review-card__heading > div { display: flex; align-items: center; gap: var(--space-2); }
.review-card__heading h2 { margin: 0; }
dl { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-4); margin: var(--space-3) 0; }
dl div { display: flex; flex-direction: column; }
dt { color: var(--color-muted); font-size: 12px; font-weight: 700; }
dd { margin: var(--space-1) 0 0; font-size: 12px; }
.risk-flags { padding: var(--space-2) var(--space-3); border-left: 3px solid var(--color-warning); border-radius: 6px; color: #71450a; background: var(--color-warning-soft); font-size: 12px; }
.risk-flags ul { margin: var(--space-1) 0 0; padding-left: var(--space-3); }
.risk-clear { color: var(--color-success); font-size: 12px; }
.review-card__actions { display: flex; align-items: flex-end; justify-content: flex-end; gap: 8px; }
.review-card__actions small { max-width: 180px; color: var(--color-danger); text-align: right; }
.review-message { margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 8px; color: var(--color-success); background: var(--color-success-soft); }
.review-message--error { color: var(--color-danger); background: var(--color-danger-soft); }
@media (max-width: 720px) { .review-card { grid-template-columns: 1fr; } .review-card__heading { flex-direction: column; } .review-card__actions { align-items: stretch; flex-direction: column-reverse; } }
</style>
