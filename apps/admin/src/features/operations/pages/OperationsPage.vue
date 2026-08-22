<script setup lang="ts">
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  COMPENSATION_SECONDS_MIN,
  ENTITY_ID_MAX_LENGTH,
  ENTITLEMENT_SECONDS_MAX,
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { computed, type Component } from "vue";
import { ConfirmDialog, Icon, PageState, StatusBadge } from "@/shared/components";
import { useOperationsPage } from "@/features/operations/composables/useOperationsPage";
import { formatDateTime } from "@/shared/utils/format";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const {
  allowed,
  loading,
  busy,
  error,
  notice,
  breaker,
  breakerDialogOpen,
  compensationDialogOpen,
  compensation,
  adjustmentDialogOpen,
  adjustment,
  replayDialogOpen,
  replay,
  callbackEvents,
  callbackFilter,
  reissueDialogOpen,
  reissue,
  load,
  refreshCallbacks,
  toggleBreaker,
  requestCompensation,
  grantCompensation,
  requestAdjustment,
  submitAdjustment,
  requestReplay,
  submitReplay,
  requestReissue,
  submitReissue,
  fillReplay,
} = useOperationsPage();

const adjustmentSummary = computed(() => {
  const freeze = adjustment.type === "RELEASE_FREEZE" ? `，冻结记录 ${adjustment.freezeAdjustmentId}` : "";
  return `将对 grant ${adjustment.grantId} 追加 ${adjustment.type} ${adjustment.seconds} 秒${freeze}。不会修改原 grant 或 debit。`;
});
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">SAFETY OPERATIONS</p><h1>运营控制</h1><p>本页自上而下为：全站熔断、补偿权益、权益纠错、死信重放、注销查询令牌补发。高风险操作只对管理员开放，并要求原因与二次确认。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以访问熔断、补偿和账本纠错。" />
    <PageState v-else-if="loading" type="loading" message="正在获取安全控制状态…" />
    <PageState v-else-if="error && !breaker" type="error" :message="error" @retry="load" />
    <template v-else>
      <div v-if="error" :class="[$style['operation-message'], $style['operation-message--error']]" role="alert">{{ error }}</div>
      <div v-if="notice" :class="$style['operation-message']" role="status">{{ notice }}</div>
      <div :class="$style['operation-grid']">
        <section v-if="breaker" :class="['panel', $style['breaker-panel'], breaker.enabled ? $style['is-enabled'] : '']" aria-labelledby="breaker-title">
          <div class="panel__header">
            <div><p class="eyebrow">CIRCUIT BREAKER</p><h2 id="breaker-title">全站播放熔断</h2></div>
            <StatusBadge :label="breaker.enabled ? '熔断已开启' : '播放正常'" :tone="breaker.enabled ? 'danger' : 'success'" />
          </div>
          <div :class="$style['breaker-visual']"><span><Icon :name="breaker.enabled ? 'stop' : 'play'" /></span><div><strong>{{ breaker.enabled ? "已阻止新播放" : "当前允许播放" }}</strong><small>{{ breaker.enabled ? "请确认事故处置完成后再恢复" : "异常时可立即阻止新的播放租约" }}</small></div></div>
          <dl>
            <div><dt>最后操作人</dt><dd>{{ breaker.updatedBy || "—" }}</dd></div>
            <div><dt>最后更新时间</dt><dd>{{ formatDateTime(breaker.updatedAt) }}</dd></div>
            <div><dt>原因</dt><dd>{{ breaker.reason || "无" }}</dd></div>
          </dl>
          <el-button class="button" :class="breaker.enabled ? 'button--secondary' : 'button--danger'" native-type="button" @click="breakerDialogOpen = true">{{ breaker.enabled ? "申请恢复播放" : "立即开启熔断" }}</el-button>
        </section>
        <section class="panel" aria-labelledby="compensation-title">
          <div class="panel__header"><div><p class="eyebrow">ENTITLEMENT</p><h2 id="compensation-title">补偿权益</h2></div><StatusBadge label="人工授予" tone="warning" /></div>
          <form :class="$style['compensation-form']" @submit.prevent="requestCompensation">
            <div class="form-grid">
              <label class="field"><span>用户 ID *</span><el-input v-model="compensation.userId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="用户内部 ID" /></label>
              <label class="field"><span>剧目 ID *</span><el-input v-model="compensation.dramaId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="drama-…" /></label>
              <label class="field"><span>补偿时长（秒）*</span><el-input v-model.number="compensation.seconds" class="admin-input" type="number" :min="COMPENSATION_SECONDS_MIN" :max="ENTITLEMENT_SECONDS_MAX" :step="COMPENSATION_SECONDS_MIN" required /></label>
              <label class="field field--wide"><span>补偿原因 *</span><el-input v-model="compensation.reason" class="admin-input" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单或用户影响" /></label>
            </div>
            <p :class="$style['form-help']">权益授予不可在浏览器中撤回；服务端将验证管理员权限、范围和幂等性。</p>
            <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并授予</el-button>
          </form>
        </section>
        <section :class="['panel', $style['panel--wide']]" aria-labelledby="adjustment-title">
          <div class="panel__header"><div><p class="eyebrow">LEDGER</p><h2 id="adjustment-title">权益纠错</h2></div><StatusBadge label="追加事实" tone="warning" /></div>
          <form :class="$style['compensation-form']" @submit.prevent="requestAdjustment">
            <div class="form-grid">
              <label class="field"><span>类型 *</span>
                <el-select v-model="adjustment.type" class="admin-select" aria-label="类型">
                  <el-option label="冻结剩余" value="FREEZE_REMAINDER" />
                  <el-option label="释放冻结" value="RELEASE_FREEZE" />
                  <el-option label="核销（不改余额）" value="WRITE_OFF" />
                </el-select>
              </label>
              <label class="field"><span>Grant ID *</span><el-input v-model="adjustment.grantId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="grant-…" /></label>
              <label class="field"><span>秒数 *</span><el-input v-model.number="adjustment.seconds" class="admin-input" type="number" min="1" :max="ENTITLEMENT_SECONDS_MAX" required /></label>
              <label v-if="adjustment.type === 'RELEASE_FREEZE'" class="field"><span>原冻结记录 ID *</span><el-input v-model="adjustment.freezeAdjustmentId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="adjustment-…" /></label>
              <label class="field field--wide"><span>原因 *</span><el-input v-model="adjustment.reason" class="admin-input" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明事故、工单与为何不能改原 grant/debit" /></label>
              <label class="field field--wide"><span>审批记录</span><el-input v-model="adjustment.approvalNote" class="admin-input" type="textarea" :rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" /></label>
            </div>
            <p :class="$style['form-help']">冻结会降低可播放余额；释放冻结必须引用原冻结记录且不超过未释放秒数；核销只记事故，不再次改变用户余额。补偿请用上方独立授予，不要改历史 grant。</p>
            <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并写入纠错</el-button>
          </form>
        </section>
        <section :class="['panel', $style['panel--wide']]" aria-labelledby="replay-title">
          <div class="panel__header"><div><p class="eyebrow">CALLBACKS</p><h2 id="replay-title">死信重放</h2></div><StatusBadge label="受审计解锁" tone="warning" /></div>
          <form :class="$style['callback-filter']" @submit.prevent="refreshCallbacks">
            <label class="field"><span>状态</span>
              <el-select v-model="callbackFilter" class="admin-select" aria-label="状态">
                <el-option label="积压（默认）" value="BACKLOG" />
                <el-option label="死信" value="DEAD_LETTER" />
                <el-option label="可重试失败" value="RETRYABLE_FAILURE" />
                <el-option label="处理中" value="PROCESSING" />
                <el-option label="已接收" value="RECEIVED" />
              </el-select>
            </label>
            <el-button class="button button--secondary" native-type="submit" :disabled="busy">刷新列表</el-button>
          </form>
          <PageState v-if="callbackEvents.length === 0" type="empty" title="当前没有匹配的回调积压" message="死信与可重试失败会显示在此；列表不含加密载荷。" />
          <div v-else :class="['table-wrap', $style['callback-table']]">
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
                    <el-button v-if="event.replayable" class="button button--secondary" native-type="button" :disabled="busy" @click="fillReplay(event)">填入重放</el-button>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <form :class="$style['compensation-form']" @submit.prevent="requestReplay">
            <div class="form-grid">
              <label class="field"><span>回调事件 ID *</span><el-input v-model="replay.eventId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="provider 事件 ID" /></label>
              <label class="field field--wide"><span>原因 *</span><el-input v-model="replay.reason" class="admin-input" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明修复依据、工单与为何可以重放" /></label>
              <label class="field field--wide"><span>审批记录</span><el-input v-model="replay.approvalNote" class="admin-input" type="textarea" :rows="2" :maxlength="ADMIN_REASON_MAX_LENGTH" placeholder="可选：审批人/工单号" /></label>
            </div>
            <p :class="$style['form-help']">仅可将 RETRYABLE_FAILURE 或 DEAD_LETTER 迁回 PROCESSING，沿用原事件 ID。若事件仍在保留期内且存有加密规范化载荷，服务端会立即用该载荷执行，不复制新的 grant/媒体事实。无载荷或已过保留期时只解锁，等待 provider 再次投递。已处理或已拒绝事件不可重放。</p>
            <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并解锁重放</el-button>
          </form>
        </section>
        <section :class="['panel', $style['panel--wide']]" aria-labelledby="reissue-title">
          <div class="panel__header"><div><p class="eyebrow">PRIVACY</p><h2 id="reissue-title">注销查询令牌补发</h2></div><StatusBadge label="客服核验" tone="warning" /></div>
          <form :class="$style['compensation-form']" @submit.prevent="requestReissue">
            <div class="form-grid">
              <label class="field"><span>注销申请 ID *</span><el-input v-model="reissue.deletionRequestId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="deletion-request-…" /></label>
              <label class="field"><span>已核验用户 ID *</span><el-input v-model="reissue.userId" class="admin-input" required autocomplete="off" :maxlength="ENTITY_ID_MAX_LENGTH" placeholder="必须与申请所属用户一致" /></label>
              <label class="field field--wide"><span>原因 *</span><el-input v-model="reissue.reason" class="admin-input" type="textarea" :rows="3" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="说明令牌遗失/过期、工单与核验方式" /></label>
              <label class="field field--wide"><span>审批/核验记录 *</span><el-input v-model="reissue.approvalNote" class="admin-input" type="textarea" :rows="2" :minlength="ADMIN_REASON_MIN_LENGTH" :maxlength="ADMIN_REASON_MAX_LENGTH" required placeholder="审批人、工单号与身份核验结论" /></label>
            </div>
            <p :class="$style['form-help']">旧 JWT 不会恢复。新令牌只在成功响应中出现一次，旧令牌立即失效。必须先核验用户身份，填写的用户 ID 必须与申请一致。Mock 模式只写演示审计。</p>
            <el-button class="button button--primary" native-type="submit" :disabled="busy">核对并补发令牌</el-button>
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

<style module lang="scss" src="../styles/operations.module.scss"></style>
