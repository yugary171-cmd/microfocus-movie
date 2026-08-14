<script setup lang="ts">
import { DramaStatus } from "@microfocus/contracts";
import { onMounted, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import PageState from "@/components/PageState.vue";
import ReleaseGatePanel from "@/components/ReleaseGatePanel.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { dramaStatusLabels } from "@/i18n";
import type { DashboardData } from "@/types/admin";

const data = ref<DashboardData | null>(null);
const loading = ref(true);
const error = ref("");

const statusOrder = [
  DramaStatus.DRAFT,
  DramaStatus.PENDING_REVIEW,
  DramaStatus.READY,
  DramaStatus.PUBLISHED,
  DramaStatus.OFFLINE,
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    data.value = await adminApi.dashboard();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function ledgerAgeLabel(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  return formatAge(Math.max(0, Math.floor((Date.now() - parsed) / 1000)));
}
</script>

<template>
  <div>
    <header class="page-header">
      <div><p class="eyebrow">OVERVIEW</p><h1>工作台</h1><p>先看风险，再处理内容。所有指标均标注来源状态。</p></div>
      <RouterLink class="button button--primary" to="/dramas/new">＋ 新建剧目</RouterLink>
    </header>
    <PageState v-if="loading" type="loading" message="正在汇总合规、内容与运营数据…" />
    <PageState v-else-if="error" type="error" :message="error" @retry="load" />
    <div v-else-if="data" class="dashboard-grid">
      <ReleaseGatePanel :gate="data.releaseGate" />
      <section class="panel status-panel" aria-labelledby="content-status-title">
        <div class="panel__header">
          <div><p class="eyebrow">CONTENT FLOW</p><h2 id="content-status-title">内容状态</h2></div>
          <StatusBadge :label="`${data.reviewBacklog} 项待审`" :tone="data.reviewBacklog ? 'warning' : 'success'" />
        </div>
        <div class="status-grid">
          <div v-for="status in statusOrder" :key="status">
            <strong>{{ data.statusCounts[status] ?? "—" }}</strong>
            <span>{{ dramaStatusLabels[status] }}</span>
          </div>
        </div>
        <RouterLink class="text-link" to="/dramas">查看全部剧目 <span aria-hidden="true">→</span></RouterLink>
      </section>
      <section class="panel callback-panel" aria-labelledby="callback-ops-title">
        <div class="panel__header">
          <div><p class="eyebrow">CALLBACKS</p><h2 id="callback-ops-title">回调积压</h2></div>
          <StatusBadge
            :label="data.callbackOps.deadLetterCount ? `${data.callbackOps.deadLetterCount} 条死信` : '无死信'"
            :tone="data.callbackOps.deadLetterCount ? 'danger' : 'success'"
          />
        </div>
        <div class="status-grid callback-grid">
          <div><strong>{{ data.callbackOps.deadLetterCount }}</strong><span>死信</span></div>
          <div><strong>{{ data.callbackOps.retryableCount }}</strong><span>可重试失败</span></div>
          <div>
            <strong>{{ data.callbackOps.oldestUnprocessedAgeSeconds == null ? "—" : formatAge(data.callbackOps.oldestUnprocessedAgeSeconds) }}</strong>
            <span>最老未处理</span>
          </div>
          <div><strong>{{ data.callbackOps.openProviderCircuits.length }}</strong><span>已开 provider 熔断</span></div>
        </div>
        <p class="callback-help">
          死信会打开对应 provider 熔断（VOD 或微信奖励），不会自动打开全站 GLOBAL。解除前请先重放死信并核对账本。
          <template v-if="data.callbackOps.openProviderCircuits.length">
            当前打开：{{ data.callbackOps.openProviderCircuits.join("、") }}。
          </template>
        </p>
        <RouterLink class="text-link" to="/operations">去运营控制处理 <span aria-hidden="true">→</span></RouterLink>
      </section>
      <section class="panel ledger-panel" aria-labelledby="ledger-ops-title">
        <div class="panel__header">
          <div><p class="eyebrow">LEDGER</p><h2 id="ledger-ops-title">权益对账</h2></div>
          <StatusBadge
            :label="data.ledgerOps.ledgerCircuitOpen || data.ledgerOps.mismatchCount ? '账本差异' : '账本一致'"
            :tone="data.ledgerOps.ledgerCircuitOpen || data.ledgerOps.mismatchCount ? 'danger' : 'success'"
          />
        </div>
        <div class="status-grid callback-grid">
          <div><strong>{{ data.ledgerOps.mismatchCount }}</strong><span>差异笔数</span></div>
          <div><strong>{{ data.ledgerOps.mismatchedSeconds }}</strong><span>差异秒数</span></div>
          <div><strong>{{ data.ledgerOps.missingGrants }}</strong><span>完成无 grant</span></div>
          <div>
            <strong>{{ ledgerAgeLabel(data.ledgerOps.lastReconciledAt) }}</strong>
            <span>距上次对账</span>
          </div>
        </div>
        <p class="callback-help">
          周期对账只对照 grant、debit 和冻结/解冻事实重建余额，不改写原记录。发现差异会打开 `PROVIDER:LEDGER` 并暂停新奖励与锁定播放；需管理员核对后关闭熔断。
        </p>
      </section>
      <section class="panel metrics-panel" aria-labelledby="metrics-title">
        <div class="panel__header">
          <div><p class="eyebrow">GREY RELEASE</p><h2 id="metrics-title">关键灰度指标</h2></div>
          <StatusBadge :label="data.metricSourceConfigured ? '数据已接入' : '数据源未配置'" :tone="data.metricSourceConfigured ? 'success' : 'warning'" />
        </div>
        <div v-if="!data.metricSourceConfigured" class="metric-empty" role="status">
          <span aria-hidden="true">⌁</span>
          <div><strong>暂无可验证的灰度数据</strong><p>接入观测数据后展示播放失败率、权益扣减异常率和完播率；当前不使用虚构数字。</p></div>
        </div>
        <div v-else class="metric-cards">
          <article><span>播放失败率</span><strong>—</strong><small>等待采样</small></article>
          <article><span>权益异常率</span><strong>—</strong><small>等待采样</small></article>
          <article><span>完播率</span><strong>—</strong><small>等待采样</small></article>
        </div>
      </section>
      <section class="panel principles-panel" aria-labelledby="today-title">
        <div class="panel__header"><div><p class="eyebrow">TODAY</p><h2 id="today-title">今日处理原则</h2></div></div>
        <ol>
          <li><span>01</span><div><strong>合规阻断优先</strong><small>闸门未通过时保持外部流量关闭</small></div></li>
          <li><span>02</span><div><strong>内容与媒体双重就绪</strong><small>审核结论不能替代 VOD 处理状态</small></div></li>
          <li><span>03</span><div><strong>高风险动作二次确认</strong><small>发布、下架、熔断与补偿均需留痕</small></div></li>
        </ol>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(310px, .75fr); gap: 18px; }
.metrics-panel { grid-column: 1 / 2; }
.callback-panel { grid-column: 1 / -1; }
.ledger-panel { grid-column: 1 / -1; }
.callback-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.callback-help { margin: 14px 0 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
.status-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.status-grid div { display: flex; align-items: center; flex-direction: column; padding: 13px 4px; border-radius: 8px; background: var(--color-surface-soft); }
.status-grid strong { font-size: 23px; }
.status-grid span { color: var(--color-muted); font-size: 11px; }
.text-link { display: inline-flex; gap: 7px; margin-top: 16px; color: var(--color-primary); font-weight: 650; }
.metric-empty { display: flex; align-items: center; gap: 15px; min-height: 116px; padding: 18px; border: 1px dashed #cad3df; border-radius: 10px; background: #fafbfd; }
.metric-empty > span { display: grid; width: 43px; height: 43px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: var(--color-info); background: var(--color-info-soft); font-size: 20px; }
.metric-empty p { max-width: 600px; margin: 4px 0 0; color: var(--color-muted); font-size: 12px; }
.metric-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.metric-cards article { display: flex; flex-direction: column; padding: 14px; border-radius: 9px; background: var(--color-surface-soft); }
.metric-cards strong { font-size: 25px; }
.principles-panel ol { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.principles-panel li { display: flex; align-items: center; gap: 11px; }
.principles-panel li > span { color: #9ba8b9; font-size: 11px; font-weight: 800; }
.principles-panel li > div { display: flex; flex-direction: column; }
@media (max-width: 1150px) { .dashboard-grid { grid-template-columns: 1fr; } .metrics-panel, .callback-panel, .ledger-panel { grid-column: auto; } }
@media (max-width: 580px) { .status-grid, .callback-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
