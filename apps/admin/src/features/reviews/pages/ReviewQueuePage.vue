<script setup lang="ts">
import { REVIEW_NOTES_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton } from "element-plus";
import { type Component } from "vue";
import { ConfirmDialog, AdminPagination, Icon, PageState, StatusBadge } from "@/shared/components";
import { formatDateTime } from "@/shared/utils/format";
import { reviewStatusLabels, reviewStatusTones } from "@/features/reviews/constants";
import { useReviewQueuePage } from "@/features/reviews/composables/useReviewQueuePage";

const ElButton = ElementButton as Component;

const {
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  notice,
  busy,
  selected,
  dialog,
  allowed,
  load,
  go,
  changePageSize,
  openDecision,
  closeDialog,
  confirmDecision,
  reviewDecision,
} = useReviewQueuePage();
</script>

<template>
  <div>
    <header class="page-header">
      <div><p class="eyebrow">REVIEW WORKSPACE</p><h1>审核队列</h1><p>审核内容与版权信息；审核结论不替代媒体平台状态。</p></div>
      <el-button v-if="allowed" class="button button--secondary" native-type="button" :disabled="loading" @click="load">刷新队列</el-button>
    </header>
    <PageState v-if="!allowed" type="forbidden" message="当前角色不能访问审核队列。" />
    <PageState v-else-if="loading" type="loading" message="正在加载待审内容…" />
    <PageState v-else-if="error && items.length === 0 && total === 0" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" :class="[$style['review-message'], $style['review-message--error']]" role="alert">{{ error }}</div>
      <div v-if="notice" :class="$style['review-message']" role="status">{{ notice }}</div>
      <PageState
        v-if="items.length === 0"
        type="empty"
        :title="total === 0 ? '审核队列已清空' : '这一页没有待审内容'"
        :message="total === 0 ? '当前没有需要处理的内容。' : '请返回上一页。'"
      />
      <div v-else :class="$style['review-list']">
        <article v-for="item in items" :key="item.id" :class="['panel', $style['review-card']]">
          <div>
            <div :class="$style['review-card__heading']">
              <div><StatusBadge :label="reviewStatusLabels[item.status]" :tone="reviewStatusTones[item.status]" /><h2>{{ item.dramaTitle }}</h2></div>
              <RouterLink class="link" :to="`/dramas/${item.dramaId}`">查看完整资料 →</RouterLink>
            </div>
            <dl>
              <div><dt>提交人</dt><dd>{{ item.submitterName }}</dd></div>
              <div><dt>提交时间</dt><dd>{{ formatDateTime(item.submittedAt) }}</dd></div>
              <div><dt>任务编号</dt><dd>{{ item.id }}</dd></div>
            </dl>
            <div v-if="item.riskFlags.length" :class="$style['risk-flags']" role="note">
              <strong>需要关注</strong><ul><li v-for="flag in item.riskFlags" :key="flag">{{ flag }}</li></ul>
            </div>
            <div v-else :class="$style['risk-clear']"><Icon name="check" />未发现自动标记的风险项，仍需人工完整复核。</div>
          </div>
          <div :class="$style['review-card__actions']">
            <template v-if="reviewDecision(item).allowed">
              <el-button class="button button--secondary" native-type="button" @click="openDecision(item, 'reject')">拒绝并退回</el-button>
              <el-button class="button button--primary" native-type="button" @click="openDecision(item, 'approve')">审核通过</el-button>
            </template>
            <small v-else>{{ reviewDecision(item).reason }}</small>
          </div>
        </article>
      </div>
      <AdminPagination
        v-if="total > 0"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :disabled="loading"
        @page-change="go"
        @page-size-change="changePageSize"
      />
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

<style module lang="scss" src="../styles/review-queue.module.scss"></style>
