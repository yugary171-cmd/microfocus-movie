<script setup lang="ts">
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  AdminRole,
  COMPENSATION_SECONDS_MIN,
  ENTITY_ID_MAX_LENGTH,
  ENTITLEMENT_SECONDS_MAX,
  REWARD_SECONDS
} from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import Icon from "@/components/Icon.vue";
import { formatDateTime } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { CircuitBreakerState, CompensationInput, AdjustmentInput, AdminCallbackEvent, CallbackReplayInput, DeletionQueryTokenReissueInput } from "@/types/admin";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const breaker = ref<CircuitBreakerState | null>(null);
const breakerDialogOpen = ref(false);
const compensationDialogOpen = ref(false);
const compensation = reactive<CompensationInput>({ userId: "", dramaId: "", seconds: REWARD_SECONDS, reason: "" });
const adjustmentDialogOpen = ref(false);
const adjustment = reactive<AdjustmentInput>({
  type: "FREEZE_REMAINDER",
  grantId: "",
  seconds: COMPENSATION_SECONDS_MIN,
  reason: "",
  freezeAdjustmentId: "",
  approvalNote: "",
});
const replayDialogOpen = ref(false);
const replay = reactive<CallbackReplayInput>({ eventId: "", reason: "", approvalNote: "" });
const callbackEvents = ref<AdminCallbackEvent[]>([]);
const callbackFilter = ref("BACKLOG");
const reissueDialogOpen = ref(false);
const reissue = reactive<DeletionQueryTokenReissueInput>({
  deletionRequestId: "",
  userId: "",
  reason: "",
  approvalNote: "",
});

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    breaker.value = await adminApi.getCircuitBreaker();
    await refreshCallbacks();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function refreshCallbacks(): Promise<void> {
  try {
    const callbackList = await adminApi.listCallbackEvents(callbackFilter.value);
    callbackEvents.value = Array.isArray(callbackList.items) ? callbackList.items : [];
  } catch (caught) {
    callbackEvents.value = [];
    error.value = toErrorMessage(caught);
  }
}

async function toggleBreaker(reason: string): Promise<void> {
  if (!breaker.value) return;
  busy.value = true;
  error.value = "";
  try {
    breaker.value = await adminApi.setCircuitBreaker(!breaker.value.enabled, reason);
    notice.value = adminApi.mode === "mock"
      ? "演示熔断状态已切换；未影响真实播放服务。"
      : `播放熔断已${breaker.value.enabled ? "开启" : "关闭"}。`;
    breakerDialogOpen.value = false;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function requireBoundedEntityId(value: string, emptyMessage: string, label: string): string {
  const id = value.trim();
  if (!id) return emptyMessage;
  if (id.length > ENTITY_ID_MAX_LENGTH) return `${label}最长 ${ENTITY_ID_MAX_LENGTH} 个字符`;
  return "";
}

function validateCompensation(): string {
  const userError = requireBoundedEntityId(compensation.userId, "请输入用户 ID", "用户 ID");
  if (userError) return userError;
  const dramaError = requireBoundedEntityId(compensation.dramaId, "请输入剧目 ID", "剧目 ID");
  if (dramaError) return dramaError;
  if (
    !Number.isInteger(compensation.seconds) ||
    compensation.seconds < COMPENSATION_SECONDS_MIN ||
    compensation.seconds > ENTITLEMENT_SECONDS_MAX
  ) {
    return `补偿时长应为 ${COMPENSATION_SECONDS_MIN}–${ENTITLEMENT_SECONDS_MAX} 秒的整数`;
  }
  if (compensation.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
    return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补偿原因`;
  }
  return "";
}

function requestCompensation(): void {
  error.value = validateCompensation();
  if (!error.value) compensationDialogOpen.value = true;
}

const adjustmentSummary = computed(() => {
  const freeze = adjustment.type === "RELEASE_FREEZE" ? `，冻结记录 ${adjustment.freezeAdjustmentId}` : "";
  return `将对 grant ${adjustment.grantId} 追加 ${adjustment.type} ${adjustment.seconds} 秒${freeze}。不会修改原 grant 或 debit。`;
});

async function grantCompensation(): Promise<void> {
  const validation = validateCompensation();
  if (validation) {
    error.value = validation;
    compensationDialogOpen.value = false;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await adminApi.compensate({
      userId: compensation.userId.trim(),
      dramaId: compensation.dramaId.trim(),
      seconds: compensation.seconds,
      reason: compensation.reason.trim(),
    });
    notice.value = adminApi.mode === "mock"
      ? "演示补偿已记入审计视图；未授予真实权益。"
      : "补偿权益已授予。";
    Object.assign(compensation, { userId: "", dramaId: "", seconds: REWARD_SECONDS, reason: "" });
    compensationDialogOpen.value = false;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function validateAdjustment(): string {
  const grantError = requireBoundedEntityId(adjustment.grantId, "请输入 grant ID", "grant ID");
  if (grantError) return grantError;
  if (
    !Number.isInteger(adjustment.seconds) ||
    adjustment.seconds < 1 ||
    adjustment.seconds > ENTITLEMENT_SECONDS_MAX
  ) {
    return `纠错秒数应为 1–${ENTITLEMENT_SECONDS_MAX} 的整数`;
  }
  if (adjustment.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
    return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的纠错原因`;
  }
  if (adjustment.type === "RELEASE_FREEZE") {
    return requireBoundedEntityId(
      adjustment.freezeAdjustmentId ?? "",
      "释放冻结必须填写原冻结记录 ID",
      "原冻结记录 ID"
    );
  }
  return "";
}

function requestAdjustment(): void {
  error.value = validateAdjustment();
  if (!error.value) adjustmentDialogOpen.value = true;
}

async function submitAdjustment(): Promise<void> {
  const validation = validateAdjustment();
  if (validation) {
    error.value = validation;
    adjustmentDialogOpen.value = false;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await adminApi.adjustEntitlement({
      type: adjustment.type,
      grantId: adjustment.grantId.trim(),
      seconds: adjustment.seconds,
      reason: adjustment.reason.trim(),
      ...(adjustment.type === "RELEASE_FREEZE" && adjustment.freezeAdjustmentId?.trim()
        ? { freezeAdjustmentId: adjustment.freezeAdjustmentId.trim() }
        : {}),
      ...(adjustment.approvalNote?.trim() ? { approvalNote: adjustment.approvalNote.trim() } : {}),
    });
    notice.value = adminApi.mode === "mock"
      ? "演示纠错已记入审计视图；未改真实账本。"
      : adjustment.type === "WRITE_OFF"
        ? "核销事实已追加，用户余额未改动。"
        : "权益纠错已写入账本。";
    Object.assign(adjustment, {
      type: "FREEZE_REMAINDER",
      grantId: "",
      seconds: COMPENSATION_SECONDS_MIN,
      reason: "",
      freezeAdjustmentId: "",
      approvalNote: "",
    });
    adjustmentDialogOpen.value = false;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function validateReplay(): string {
  const eventError = requireBoundedEntityId(replay.eventId, "请输入回调事件 ID", "回调事件 ID");
  if (eventError) return eventError;
  if (replay.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
    return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的重放原因`;
  }
  return "";
}

function requestReplay(): void {
  error.value = validateReplay();
  if (!error.value) replayDialogOpen.value = true;
}

async function submitReplay(): Promise<void> {
  const validation = validateReplay();
  if (validation) {
    error.value = validation;
    replayDialogOpen.value = false;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await adminApi.replayCallback({
      eventId: replay.eventId.trim(),
      reason: replay.reason.trim(),
      ...(replay.approvalNote?.trim() ? { approvalNote: replay.approvalNote.trim() } : {}),
    });
    notice.value = adminApi.mode === "mock"
      ? "演示重放已记入审计视图；未解锁或执行真实回调。"
      : "回调已解锁。若存有未过期的加密载荷，服务端已尝试执行；否则需等待 provider 再次投递。不会复制新的业务事实。";
    Object.assign(replay, { eventId: "", reason: "", approvalNote: "" });
    replayDialogOpen.value = false;
    await refreshCallbacks();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function validateReissue(): string {
  const requestError = requireBoundedEntityId(
    reissue.deletionRequestId,
    "请输入注销申请 ID",
    "注销申请 ID"
  );
  if (requestError) return requestError;
  const userError = requireBoundedEntityId(reissue.userId, "请输入已核验的用户 ID", "已核验用户 ID");
  if (userError) return userError;
  if (reissue.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
    return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补发原因`;
  }
  if (reissue.approvalNote.trim().length < ADMIN_REASON_MIN_LENGTH) {
    return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的审批/核验记录`;
  }
  return "";
}

function requestReissue(): void {
  error.value = validateReissue();
  if (!error.value) reissueDialogOpen.value = true;
}

async function submitReissue(): Promise<void> {
  const validation = validateReissue();
  if (validation) {
    error.value = validation;
    reissueDialogOpen.value = false;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const result = await adminApi.reissueDeletionQueryToken({
      deletionRequestId: reissue.deletionRequestId.trim(),
      userId: reissue.userId.trim(),
      reason: reissue.reason.trim(),
      approvalNote: reissue.approvalNote.trim(),
    });
    if (adminApi.mode === "mock") {
      notice.value = "演示补发已记入审计视图；未签发真实查询令牌，也不能恢复已撤销登录。";
    } else if (result.deletionQueryToken) {
      notice.value = `查询令牌已补发（只显示一次）：${result.deletionQueryToken}`;
    } else {
      notice.value = "同一幂等键已处理过，不会再次返回查询令牌。";
    }
    Object.assign(reissue, { deletionRequestId: "", userId: "", reason: "", approvalNote: "" });
    reissueDialogOpen.value = false;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function fillReplay(event: AdminCallbackEvent): void {
  replay.eventId = event.eventId;
  error.value = "";
  notice.value = `已填入事件 ${event.eventId}，请补充原因后解锁。`;
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">SAFETY OPERATIONS</p><h1>运营控制</h1><p>本页自上而下为：全站熔断、补偿权益、权益纠错、死信重放、注销查询令牌补发。高风险操作只对管理员开放，并要求原因与二次确认。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以访问熔断、补偿和账本纠错。" />
    <PageState v-else-if="loading" type="loading" message="正在获取安全控制状态…" />
    <PageState v-else-if="error && !breaker" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" class="operation-message operation-message--error" role="alert">{{ error }}</div>
      <div v-if="notice" class="operation-message" role="status">{{ notice }}</div>
      <div class="operation-grid">
        <section v-if="breaker" class="panel breaker-panel" :class="{ 'is-enabled': breaker.enabled }" aria-labelledby="breaker-title">
          <div class="panel__header">
            <div><p class="eyebrow">CIRCUIT BREAKER</p><h2 id="breaker-title">全站播放熔断</h2></div>
            <StatusBadge :label="breaker.enabled ? '熔断已开启' : '播放正常'" :tone="breaker.enabled ? 'danger' : 'success'" />
          </div>
          <div class="breaker-visual"><span><Icon :name="breaker.enabled ? 'stop' : 'play'" /></span><div><strong>{{ breaker.enabled ? "已阻止新播放" : "当前允许播放" }}</strong><small>{{ breaker.enabled ? "请确认事故处置完成后再恢复" : "异常时可立即阻止新的播放租约" }}</small></div></div>
          <dl>
            <div><dt>最后操作人</dt><dd>{{ breaker.updatedBy || "—" }}</dd></div>
            <div><dt>最后更新时间</dt><dd>{{ formatDateTime(breaker.updatedAt) }}</dd></div>
            <div><dt>原因</dt><dd>{{ breaker.reason || "无" }}</dd></div>
          </dl>
          <button class="button" :class="breaker.enabled ? 'button--secondary' : 'button--danger'" type="button" @click="breakerDialogOpen = true">{{ breaker.enabled ? "申请恢复播放" : "立即开启熔断" }}</button>
        </section>
        <section class="panel" aria-labelledby="compensation-title">
          <div class="panel__header"><div><p class="eyebrow">ENTITLEMENT</p><h2 id="compensation-title">补偿权益</h2></div><StatusBadge label="人工授予" tone="warning" /></div>
          <form class="compensation-form" @submit.prevent="requestCompensation">
            <div class="form-grid">
              <label class="field"><span>用户 ID *</span><input v-model="compensation.userId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="用户内部 ID" /></label>
              <label class="field"><span>剧目 ID *</span><input v-model="compensation.dramaId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="drama-…" /></label>
              <label class="field"><span>补偿时长（秒）*</span><input v-model.number="compensation.seconds" type="number" :min="COMPENSATION_SECONDS_MIN" :max="ENTITLEMENT_SECONDS_MAX" :step="COMPENSATION_SECONDS_MIN" required /></label>
              <label class="field field--wide"><span>补偿原因 *</span><textarea v-model="compensation.reason" rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单或用户影响" /></label>
            </div>
            <p class="form-help">权益授予不可在浏览器中撤回；服务端将验证管理员权限、范围和幂等性。</p>
            <button class="button button--primary" type="submit" :disabled="busy">核对并授予</button>
          </form>
        </section>
        <section class="panel panel--wide" aria-labelledby="adjustment-title">
          <div class="panel__header"><div><p class="eyebrow">LEDGER</p><h2 id="adjustment-title">权益纠错</h2></div><StatusBadge label="追加事实" tone="warning" /></div>
          <form class="compensation-form" @submit.prevent="requestAdjustment">
            <div class="form-grid">
              <label class="field"><span>类型 *</span>
                <select v-model="adjustment.type">
                  <option value="FREEZE_REMAINDER">冻结剩余</option>
                  <option value="RELEASE_FREEZE">释放冻结</option>
                  <option value="WRITE_OFF">核销（不改余额）</option>
                </select>
              </label>
              <label class="field"><span>Grant ID *</span><input v-model="adjustment.grantId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="grant-…" /></label>
              <label class="field"><span>秒数 *</span><input v-model.number="adjustment.seconds" type="number" min="1" :max="ENTITLEMENT_SECONDS_MAX" required /></label>
              <label v-if="adjustment.type === 'RELEASE_FREEZE'" class="field"><span>原冻结记录 ID *</span><input v-model="adjustment.freezeAdjustmentId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="adjustment-…" /></label>
              <label class="field field--wide"><span>原因 *</span><textarea v-model="adjustment.reason" rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单与为何不能改原 grant/debit" /></label>
              <label class="field field--wide"><span>审批记录</span><textarea v-model="adjustment.approvalNote" rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" /></label>
            </div>
            <p class="form-help">冻结会降低可播放余额；释放冻结必须引用原冻结记录且不超过未释放秒数；核销只记事故，不再次改变用户余额。补偿请用上方独立授予，不要改历史 grant。</p>
            <button class="button button--primary" type="submit" :disabled="busy">核对并写入纠错</button>
          </form>
        </section>
        <section class="panel panel--wide" aria-labelledby="replay-title">
          <div class="panel__header"><div><p class="eyebrow">CALLBACKS</p><h2 id="replay-title">死信重放</h2></div><StatusBadge label="受审计解锁" tone="warning" /></div>
          <form class="callback-filter" @submit.prevent="refreshCallbacks">
            <label class="field"><span>状态</span>
              <select v-model="callbackFilter">
                <option value="BACKLOG">积压（默认）</option>
                <option value="DEAD_LETTER">死信</option>
                <option value="RETRYABLE_FAILURE">可重试失败</option>
                <option value="PROCESSING">处理中</option>
                <option value="RECEIVED">已接收</option>
              </select>
            </label>
            <button class="button button--secondary" type="submit" :disabled="busy">刷新列表</button>
          </form>
          <PageState v-if="callbackEvents.length === 0" type="empty" title="当前没有匹配的回调积压" message="死信与可重试失败会显示在此；列表不含加密载荷。" />
          <div v-else class="table-wrap callback-table">
            <table>
              <thead><tr><th>事件</th><th>Provider</th><th>状态</th><th>尝试</th><th>收到时间</th><th>载荷</th><th></th></tr></thead>
              <tbody>
                <tr v-for="event in callbackEvents" :key="event.eventId">
                  <td><code>{{ event.eventId }}</code><small>{{ event.eventType }}</small></td>
                  <td>{{ event.provider }}</td>
                  <td><StatusBadge :label="event.status" :tone="event.status === 'DEAD_LETTER' ? 'danger' : event.status === 'RETRYABLE_FAILURE' ? 'warning' : 'neutral'" /></td>
                  <td>{{ event.attempts }}</td>
                  <td class="nowrap">{{ formatDateTime(event.receivedAt) }}</td>
                  <td>{{ event.payloadAvailable ? "可立即执行" : "需等待再投递" }}</td>
                  <td>
                    <button v-if="event.replayable" class="button button--secondary" type="button" :disabled="busy" @click="fillReplay(event)">填入重放</button>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <form class="compensation-form" @submit.prevent="requestReplay">
            <div class="form-grid">
              <label class="field"><span>回调事件 ID *</span><input v-model="replay.eventId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="provider 事件 ID" /></label>
              <label class="field field--wide"><span>原因 *</span><textarea v-model="replay.reason" rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明修复依据、工单与为何可以重放" /></label>
              <label class="field field--wide"><span>审批记录</span><textarea v-model="replay.approvalNote" rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" /></label>
            </div>
            <p class="form-help">仅可将 RETRYABLE_FAILURE 或 DEAD_LETTER 迁回 PROCESSING，沿用原事件 ID。若事件仍在保留期内且存有加密规范化载荷，服务端会立即用该载荷执行，不复制新的 grant/媒体事实。无载荷或已过保留期时只解锁，等待 provider 再次投递。已处理或已拒绝事件不可重放。</p>
            <button class="button button--primary" type="submit" :disabled="busy">核对并解锁重放</button>
          </form>
        </section>
        <section class="panel panel--wide" aria-labelledby="reissue-title">
          <div class="panel__header"><div><p class="eyebrow">PRIVACY</p><h2 id="reissue-title">注销查询令牌补发</h2></div><StatusBadge label="客服核验" tone="warning" /></div>
          <form class="compensation-form" @submit.prevent="requestReissue">
            <div class="form-grid">
              <label class="field"><span>注销申请 ID *</span><input v-model="reissue.deletionRequestId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="deletion-request-…" /></label>
              <label class="field"><span>已核验用户 ID *</span><input v-model="reissue.userId" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="必须与申请所属用户一致" /></label>
              <label class="field field--wide"><span>原因 *</span><textarea v-model="reissue.reason" rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明令牌遗失/过期、工单与核验方式" /></label>
              <label class="field field--wide"><span>审批/核验记录 *</span><textarea v-model="reissue.approvalNote" rows="2" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="审批人、工单号与身份核验结论" /></label>
            </div>
            <p class="form-help">旧 JWT 不会恢复。新令牌只在成功响应中出现一次，旧令牌立即失效。必须先核验用户身份，填写的用户 ID 必须与申请一致。Mock 模式只写演示审计。</p>
            <button class="button button--primary" type="submit" :disabled="busy">核对并补发令牌</button>
          </form>
        </section>
      </div>
    </template>
    <ConfirmDialog :open="breakerDialogOpen" :title="breaker?.enabled ? '恢复全站播放' : '开启全站播放熔断'" :message="breaker?.enabled ? '恢复后将重新允许创建播放租约，请确认故障已处置。' : '开启后将阻止新的播放租约。这是高影响操作，请说明事故原因。'" :confirm-label="breaker?.enabled ? '确认恢复' : '确认熔断'" :tone="breaker?.enabled ? 'primary' : 'danger'" require-reason :reason-label="breaker?.enabled ? '恢复依据' : '事故原因'" :busy="busy" @close="breakerDialogOpen = false" @confirm="toggleBreaker" />
    <ConfirmDialog :open="compensationDialogOpen" title="确认授予补偿权益" :message="`将向用户 ${compensation.userId} 授予剧目 ${compensation.dramaId} 的 ${compensation.seconds} 秒权益。请确认工单信息准确。`" confirm-label="确认授予" :busy="busy" @close="compensationDialogOpen = false" @confirm="grantCompensation" />
    <ConfirmDialog :open="adjustmentDialogOpen" title="确认写入权益纠错" :message="adjustmentSummary" confirm-label="确认写入" :busy="busy" @close="adjustmentDialogOpen = false" @confirm="submitAdjustment" />
    <ConfirmDialog :open="replayDialogOpen" title="确认解锁回调重放" :message="`将事件 ${replay.eventId} 迁回 PROCESSING，并在有加密载荷时立即执行。不会复制 grant、媒体或奖励事实。`" confirm-label="确认解锁" :busy="busy" @close="replayDialogOpen = false" @confirm="submitReplay" />
    <ConfirmDialog :open="reissueDialogOpen" title="确认补发注销查询令牌" :message="`将作废申请 ${reissue.deletionRequestId} 的旧查询令牌，并向已核验用户 ${reissue.userId} 签发新令牌。不会恢复登录会话。`" confirm-label="确认补发" :busy="busy" @close="reissueDialogOpen = false" @confirm="submitReissue" />
  </div>
</template>

<style scoped>
.operation-grid { display: grid; grid-template-columns: minmax(320px, .8fr) minmax(420px, 1.2fr); gap: var(--space-3); align-items: start; }
.panel--wide { grid-column: 1 / -1; }
.breaker-panel { border-top: 3px solid var(--color-success); }
.breaker-panel.is-enabled { border-top-color: var(--color-danger); background: linear-gradient(#fff, #fffafa); }
.breaker-visual { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: 10px; background: var(--color-success-soft); }
.is-enabled .breaker-visual { color: var(--color-danger); background: var(--color-danger-soft); }
.breaker-visual > span { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 50%; color: #fff; background: var(--color-success); }
.is-enabled .breaker-visual > span { background: var(--color-danger); }
.breaker-visual > div { display: flex; flex-direction: column; }
.breaker-panel dl { display: grid; gap: var(--space-2); margin: var(--space-3) 0; }
.breaker-panel dl div { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-2); }
.breaker-panel dt { color: var(--color-muted); font-size: 11px; }
.breaker-panel dd { margin: 0; }
.callback-filter { display: flex; align-items: end; gap: var(--space-3); margin-bottom: var(--space-3); }
.callback-table { margin-bottom: var(--space-3); }
.callback-table td { vertical-align: top; }
.callback-table small { display: block; color: var(--color-muted); }
.compensation-form { display: grid; gap: var(--space-3); }
.form-help { margin: 0; padding: var(--space-2) var(--space-3); border-radius: 7px; color: var(--color-muted); background: var(--color-surface-soft); font-size: 11px; }
.operation-message { margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 8px; color: var(--color-success); background: var(--color-success-soft); }
.operation-message--error { color: var(--color-danger); background: var(--color-danger-soft); }
@media (max-width: 1040px) { .operation-grid { grid-template-columns: 1fr; } }
</style>
