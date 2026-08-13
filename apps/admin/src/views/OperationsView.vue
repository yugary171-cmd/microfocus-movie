<script setup lang="ts">
import { AdminRole } from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PageState from "@/components/PageState.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { formatDateTime } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import type { CircuitBreakerState, CompensationInput } from "@/types/admin";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const breaker = ref<CircuitBreakerState | null>(null);
const breakerDialogOpen = ref(false);
const compensationDialogOpen = ref(false);
const compensation = reactive<CompensationInput>({ userId: "", dramaId: "", seconds: 600, reason: "" });

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    breaker.value = await adminApi.getCircuitBreaker();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
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

function validateCompensation(): string {
  if (!compensation.userId.trim()) return "请输入用户 ID";
  if (!compensation.dramaId.trim()) return "请输入剧目 ID";
  if (!Number.isInteger(compensation.seconds) || compensation.seconds < 60 || compensation.seconds > 86_400) return "补偿时长应为 60–86400 秒的整数";
  if (compensation.reason.trim().length < 6) return "请填写至少 6 个字的补偿原因";
  return "";
}

function requestCompensation(): void {
  error.value = validateCompensation();
  if (!error.value) compensationDialogOpen.value = true;
}

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
    Object.assign(compensation, { userId: "", dramaId: "", seconds: 600, reason: "" });
    compensationDialogOpen.value = false;
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header"><div><p class="eyebrow">SAFETY OPERATIONS</p><h1>运营控制</h1><p>高风险操作只对管理员开放，并要求原因与二次确认。</p></div></header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以访问熔断和补偿权益。" />
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
          <div class="breaker-visual"><span aria-hidden="true">{{ breaker.enabled ? "■" : "▶" }}</span><div><strong>{{ breaker.enabled ? "已阻止新播放" : "当前允许播放" }}</strong><small>{{ breaker.enabled ? "请确认事故处置完成后再恢复" : "异常时可立即阻止新的播放租约" }}</small></div></div>
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
              <label class="field"><span>用户 ID *</span><input v-model="compensation.userId" required autocomplete="off" placeholder="用户内部 ID" /></label>
              <label class="field"><span>剧目 ID *</span><input v-model="compensation.dramaId" required autocomplete="off" placeholder="drama-…" /></label>
              <label class="field"><span>补偿时长（秒）*</span><input v-model.number="compensation.seconds" type="number" min="60" max="86400" step="60" required /></label>
              <label class="field field--wide"><span>补偿原因 *</span><textarea v-model="compensation.reason" rows="3" minlength="6" maxlength="300" required placeholder="说明事故、工单或用户影响" /></label>
            </div>
            <p class="form-help">权益授予不可在浏览器中撤回；服务端将验证管理员权限、范围和幂等性。</p>
            <button class="button button--primary" type="submit" :disabled="busy">核对并授予</button>
          </form>
        </section>
      </div>
    </template>
    <ConfirmDialog :open="breakerDialogOpen" :title="breaker?.enabled ? '恢复全站播放' : '开启全站播放熔断'" :message="breaker?.enabled ? '恢复后将重新允许创建播放租约，请确认故障已处置。' : '开启后将阻止新的播放租约。这是高影响操作，请说明事故原因。'" :confirm-label="breaker?.enabled ? '确认恢复' : '确认熔断'" :tone="breaker?.enabled ? 'primary' : 'danger'" require-reason :reason-label="breaker?.enabled ? '恢复依据' : '事故原因'" :busy="busy" @close="breakerDialogOpen = false" @confirm="toggleBreaker" />
    <ConfirmDialog :open="compensationDialogOpen" title="确认授予补偿权益" :message="`将向用户 ${compensation.userId} 授予剧目 ${compensation.dramaId} 的 ${compensation.seconds} 秒权益。请确认工单信息准确。`" confirm-label="确认授予" :busy="busy" @close="compensationDialogOpen = false" @confirm="grantCompensation" />
  </div>
</template>

<style scoped>
.operation-grid { display: grid; grid-template-columns: minmax(320px, .8fr) minmax(420px, 1.2fr); gap: 18px; align-items: start; }
.breaker-panel { border-top: 3px solid var(--color-success); }
.breaker-panel.is-enabled { border-top-color: var(--color-danger); background: linear-gradient(#fff, #fffafa); }
.breaker-visual { display: flex; align-items: center; gap: 13px; padding: 15px; border-radius: 10px; background: var(--color-success-soft); }
.is-enabled .breaker-visual { color: var(--color-danger); background: var(--color-danger-soft); }
.breaker-visual > span { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 50%; color: #fff; background: var(--color-success); }
.is-enabled .breaker-visual > span { background: var(--color-danger); }
.breaker-visual > div { display: flex; flex-direction: column; }
.breaker-panel dl { display: grid; gap: 9px; margin: 17px 0; }
.breaker-panel dl div { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
.breaker-panel dt { color: var(--color-muted); font-size: 11px; }
.breaker-panel dd { margin: 0; }
.compensation-form { display: grid; gap: 14px; }
.form-help { margin: 0; padding: 9px 11px; border-radius: 7px; color: var(--color-muted); background: var(--color-surface-soft); font-size: 11px; }
.operation-message { margin-bottom: 14px; padding: 10px 12px; border-radius: 8px; color: var(--color-success); background: var(--color-success-soft); }
.operation-message--error { color: var(--color-danger); background: var(--color-danger-soft); }
@media (max-width: 1040px) { .operation-grid { grid-template-columns: 1fr; } }
</style>
