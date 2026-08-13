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
@media (max-width: 1150px) { .dashboard-grid { grid-template-columns: 1fr; } .metrics-panel { grid-column: auto; } }
@media (max-width: 580px) { .status-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
