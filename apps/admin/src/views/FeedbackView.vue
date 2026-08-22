<script setup lang="ts">
import { AdminRole, UserFeedbackStatus, FEEDBACK_NOTE_MAX_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { computed, onMounted, reactive, ref, type Component } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import AdminSearchInput from "@/components/AdminSearchInput.vue";
import { useAuthStore } from "@/stores/auth";
import type { AdminFeedbackRecord, FeedbackStatus } from "@/types/admin";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const auth = useAuthStore(); const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<AdminFeedbackRecord[]>([]); const selected = ref<AdminFeedbackRecord | null>(null);
const loading = ref(true); const busy = ref(false); const error = ref(""); const query = ref(""); const status = ref("");
const form = reactive({ internalNote: "", reply: "", status: UserFeedbackStatus.NEW as FeedbackStatus });
async function load() { if (!allowed.value) { loading.value = false; return; } loading.value = true; error.value = ""; try { items.value = (await adminApi.listFeedback(query.value, status.value, 1)).items; if (selected.value) await select(selected.value.id); } catch (caught) { error.value = toErrorMessage(caught); } finally { loading.value = false; } }
async function select(id: string) { try { selected.value = await adminApi.getFeedback(id); form.internalNote = selected.value.internalNote ?? ""; form.status = selected.value.status as FeedbackStatus; } catch (caught) { error.value = toErrorMessage(caught); } }
async function save() { if (!selected.value) return; busy.value = true; try { selected.value = await adminApi.updateFeedback(selected.value.id, { status: form.status, internalNote: form.internalNote }); await load(); } catch (caught) { error.value = toErrorMessage(caught); } finally { busy.value = false; } }
async function reply() { if (!selected.value || !form.reply.trim()) return; busy.value = true; try { await adminApi.replyFeedback(selected.value.id, form.reply.trim()); form.reply = ""; await select(selected.value.id); await load(); } catch (caught) { error.value = toErrorMessage(caught); } finally { busy.value = false; } }
onMounted(() => void load());
</script>

<template>
  <div><header class="page-header"><div><p class="eyebrow">USER FEEDBACK</p><h1>用户反馈</h1><p>查看登录用户反馈，记录处理状态和内部备注，并向用户发送单向回复。</p></div></header><PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以处理用户反馈。" /><div v-else class="feedback-layout"><section class="panel"><div class="toolbar feedback-toolbar"><AdminSearchInput v-model="query" class="feedback-toolbar__search" aria-label="搜索用户反馈" placeholder="用户或反馈内容" @submit="load" /><el-select v-model="status" class="admin-select" aria-label="反馈状态" placeholder="全部反馈状态" @change="load"><el-option :label="'待处理'" :value="UserFeedbackStatus.NEW" /><el-option :label="'处理中'" :value="UserFeedbackStatus.PROCESSING" /><el-option :label="'已解决'" :value="UserFeedbackStatus.RESOLVED" /></el-select></div><PageState v-if="loading" type="loading" message="正在读取反馈…" /><PageState v-else-if="items.length === 0" type="empty" title="暂无反馈" message="还没有匹配的用户反馈。" /><div v-else class="feedback-list"><button v-for="item in items" :key="item.id" class="feedback-row" :class="{ active: selected?.id === item.id }" type="button" @click="select(item.id)"><span><strong>{{ item.userName || item.userId }}</strong><small>{{ item.createdAt.slice(0, 10) }}</small></span><em>{{ item.status }}</em></button></div></section><section class="panel detail"><PageState v-if="!selected" type="empty" title="选择一条反馈" message="查看详情并处理。" /><template v-else><div class="detail-meta">{{ selected.userName }} · {{ selected.userId }} · {{ selected.createdAt.slice(0, 10) }}</div><p class="feedback-body">{{ selected.body }}</p><div v-for="reply in selected.replies" :key="reply.id" class="reply">管理员回复：{{ reply.body }}</div><label class="field"><span>处理状态</span><el-select v-model="form.status" class="admin-select" aria-label="处理状态" placeholder="请选择处理状态"><el-option label="待处理" :value="UserFeedbackStatus.NEW" /><el-option label="处理中" :value="UserFeedbackStatus.PROCESSING" /><el-option label="已解决" :value="UserFeedbackStatus.RESOLVED" /></el-select></label><label class="field"><span>内部备注</span><el-input v-model="form.internalNote" class="admin-input" type="textarea" :maxlength="FEEDBACK_NOTE_MAX_LENGTH" :rows="4" /></label><el-button class="button button--secondary" native-type="button" :disabled="busy" @click="save">保存处理信息</el-button><label class="field reply-field"><span>回复用户</span><el-input v-model="form.reply" class="admin-input" type="textarea" :maxlength="FEEDBACK_NOTE_MAX_LENGTH" :rows="4" placeholder="回复将作为用户通知发送" /></label><el-button class="button button--primary" native-type="button" :disabled="busy || !form.reply.trim()" @click="reply">发送回复</el-button></template></section></div><div v-if="error" class="operation-message operation-message--error">{{ error }}</div></div>
</template>

<style scoped>
.feedback-layout { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(420px, 1.2fr); gap: var(--space-4); }.field { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }.toolbar .field { margin-bottom: 0; }.field span { color: var(--color-muted); font-size: 12px; }.field input,.field textarea,.field select { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--color-border); border-radius: 2px; font: inherit; }.feedback-toolbar { align-items: center; gap: var(--space-2); }.feedback-toolbar__search { flex: 1 1 auto; min-width: 0; }.feedback-toolbar > .admin-select { flex: 0 0 180px; width: 180px; }.feedback-row { display: flex; width: 100%; justify-content: space-between; padding: 14px 0; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; text-align: left; cursor: pointer; }.feedback-row.active { color: var(--color-primary); }.feedback-row span { display: flex; flex-direction: column; gap: 4px; }.feedback-row small,.feedback-row em,.detail-meta { color: var(--color-muted); font-size: 12px; font-style: normal; }.feedback-body { white-space: pre-wrap; line-height: 1.7; }.reply { margin: 12px 0; padding: 12px; color: #8b4e25; background: #fff5ec; border-radius: 6px; }.reply-field { margin-top: 24px; }.operation-message { margin-top: 16px; }.operation-message--error { color: var(--color-danger); }@media (max-width: 900px) { .feedback-layout { grid-template-columns: 1fr; } }
</style>

<style scoped>
@media (max-width: 760px) {
  .feedback-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .feedback-toolbar__search,
  .feedback-toolbar > .admin-select {
    flex: 0 0 auto;
    width: 100%;
  }
}
</style>
