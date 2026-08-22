<script setup lang="ts">
import type { ReleaseGateStatus } from "@microfocus/contracts";
import { Icon, StatusBadge } from "@/shared/components";

defineProps<{ gate: ReleaseGateStatus }>();

const checks: Array<{ key: keyof ReleaseGateStatus; label: string; help: string }> = [
  { key: "entityApproved", label: "主体资质", help: "运营主体与相关证照" },
  { key: "miniProgramFilingApproved", label: "小程序备案", help: "微信小程序备案状态" },
  { key: "wechatCategoryApproved", label: "微信类目", help: "短剧类目及内容准入" },
  { key: "adsApproved", label: "广告能力", help: "流量主与激励广告能力" },
];
</script>

<template>
  <section class="panel gate-panel" aria-labelledby="release-gate-title">
    <div class="panel__header">
      <div>
        <p class="eyebrow">RELEASE GATE</p>
        <h2 id="release-gate-title">外部流量合规闸门</h2>
      </div>
      <StatusBadge
        :label="gate.readyForExternalTraffic ? '允许外部放量' : '禁止外部放量'"
        :tone="gate.readyForExternalTraffic ? 'success' : 'danger'"
      />
    </div>
    <ul class="gate-checks">
      <li v-for="check in checks" :key="check.key">
        <span class="gate-checks__mark" :class="{ 'is-ready': Boolean(gate[check.key]) }" aria-hidden="true">
          <Icon :name="gate[check.key] ? 'check' : 'close'" />
        </span>
        <span><strong>{{ check.label }}</strong><small>{{ check.help }}</small></span>
      </li>
    </ul>
    <div v-if="gate.blockers.length" class="gate-blockers" role="alert">
      <strong>当前阻断项</strong>
      <ul>
        <li v-for="blocker in gate.blockers" :key="blocker">{{ blocker }}</li>
      </ul>
    </div>
  </section>
</template>
