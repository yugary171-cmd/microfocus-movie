<script setup lang="ts">
import { AdminRole, UserFeedbackStatus, FEEDBACK_NOTE_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { type Component } from "vue";
import { AdminSearchInput, PageState } from "@/shared/components";
import { feedbackStatusLabels } from "@/features/feedback/constants";
import { useFeedbackPage } from "@/features/feedback/composables/useFeedbackPage";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const {
  allowed,
  items,
  selected,
  loading,
  busy,
  error,
  query,
  status,
  form,
  load,
  select,
  save,
  reply,
} = useFeedbackPage();
</script>

<template>
  <div><header class="page-header"><div><p class="eyebrow">USER FEEDBACK</p><h1>用户反馈</h1><p>查看登录用户反馈，记录处理状态和内部备注，并向用户发送单向回复。</p></div></header><PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以处理用户反馈。" /><div v-else :class="$style['feedback-layout']"><section class="panel"><div :class="['toolbar', $style['feedback-toolbar']]"><AdminSearchInput v-model="query" :class="$style['feedback-toolbar__search']" aria-label="搜索用户反馈" placeholder="用户或反馈内容" @submit="load" /><el-select v-model="status" class="admin-select" aria-label="反馈状态" placeholder="全部反馈状态" @change="load"><el-option :label="feedbackStatusLabels[UserFeedbackStatus.NEW]" :value="UserFeedbackStatus.NEW" /><el-option :label="feedbackStatusLabels[UserFeedbackStatus.PROCESSING]" :value="UserFeedbackStatus.PROCESSING" /><el-option :label="feedbackStatusLabels[UserFeedbackStatus.RESOLVED]" :value="UserFeedbackStatus.RESOLVED" /></el-select></div><PageState v-if="loading" type="loading" message="正在读取反馈…" /><PageState v-else-if="items.length === 0" type="empty" title="暂无反馈" message="还没有匹配的用户反馈。" /><div v-else><button v-for="item in items" :key="item.id" :class="[$style['feedback-row'], selected?.id === item.id ? $style.active : '']" type="button" @click="select(item.id)"><span><strong>{{ item.userName || item.userId }}</strong><small>{{ item.createdAt.slice(0, 10) }}</small></span><em>{{ item.status }}</em></button></div></section><section class="panel"><PageState v-if="!selected" type="empty" title="选择一条反馈" message="查看详情并处理。" /><template v-else><div :class="$style['detail-meta']">{{ selected.userName }} · {{ selected.userId }} · {{ selected.createdAt.slice(0, 10) }}</div><p :class="$style['feedback-body']">{{ selected.body }}</p><div v-for="reply in selected.replies" :key="reply.id" :class="$style.reply">管理员回复：{{ reply.body }}</div><label :class="$style['feedback-field']"><span>处理状态</span><el-select v-model="form.status" class="admin-select" aria-label="处理状态" placeholder="请选择处理状态"><el-option :label="feedbackStatusLabels[UserFeedbackStatus.NEW]" :value="UserFeedbackStatus.NEW" /><el-option :label="feedbackStatusLabels[UserFeedbackStatus.PROCESSING]" :value="UserFeedbackStatus.PROCESSING" /><el-option :label="feedbackStatusLabels[UserFeedbackStatus.RESOLVED]" :value="UserFeedbackStatus.RESOLVED" /></el-select></label><label :class="$style['feedback-field']"><span>内部备注</span><el-input v-model="form.internalNote" class="admin-input" type="textarea" :maxlength="FEEDBACK_NOTE_MAX_LENGTH" :rows="4" /></label><el-button class="button button--secondary" native-type="button" :disabled="busy" @click="save">保存处理信息</el-button><label :class="[$style['feedback-field'], $style['reply-field']]"><span>回复用户</span><el-input v-model="form.reply" class="admin-input" type="textarea" :maxlength="FEEDBACK_NOTE_MAX_LENGTH" :rows="4" placeholder="回复将作为用户通知发送" /></label><el-button class="button button--primary" native-type="button" :disabled="busy || !form.reply.trim()" @click="reply">发送回复</el-button></template></section></div><div v-if="error" :class="[$style['operation-message'], $style['operation-message--error']]">{{ error }}</div></div>
</template>

<style module lang="scss" src="../styles/feedback.module.scss"></style>
