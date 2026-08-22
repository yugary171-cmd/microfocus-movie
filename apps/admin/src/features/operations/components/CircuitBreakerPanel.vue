<script setup lang="ts">
import { ElButton as ElementButton } from "element-plus";
import type { Component } from "vue";
import { Icon, StatusBadge } from "@/shared/components";
import { formatDateTime } from "@/shared/utils/format";
import type { CircuitBreakerState } from "@/shared/types";

const ElButton = ElementButton as Component;

defineProps<{
  breaker: CircuitBreakerState;
  busy: boolean;
}>();

const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <section :class="['panel', $style['breaker-panel'], breaker.enabled ? $style['is-enabled'] : '']" aria-labelledby="breaker-title">
    <div class="panel__header">
      <div><p class="eyebrow">CIRCUIT BREAKER</p><h2 id="breaker-title">全站播放熔断</h2></div>
      <StatusBadge :label="breaker.enabled ? '熔断已开启' : '播放正常'" :tone="breaker.enabled ? 'danger' : 'success'" />
    </div>
    <div :class="$style['breaker-visual']">
      <span><Icon :name="breaker.enabled ? 'stop' : 'play'" /></span>
      <div><strong>{{ breaker.enabled ? "已阻止新播放" : "当前允许播放" }}</strong><small>{{ breaker.enabled ? "请确认事故处置完成后再恢复" : "异常时可立即阻止新的播放租约" }}</small></div>
    </div>
    <dl>
      <div><dt>最后操作人</dt><dd>{{ breaker.updatedBy || "—" }}</dd></div>
      <div><dt>最后更新时间</dt><dd>{{ formatDateTime(breaker.updatedAt) }}</dd></div>
      <div><dt>原因</dt><dd>{{ breaker.reason || "无" }}</dd></div>
    </dl>
    <el-button class="button" :class="breaker.enabled ? 'button--secondary' : 'button--danger'" native-type="button" @click="emit('open')">{{ breaker.enabled ? "申请恢复播放" : "立即开启熔断" }}</el-button>
  </section>
</template>

<style module lang="scss" src="../styles/operations.module.scss"></style>
