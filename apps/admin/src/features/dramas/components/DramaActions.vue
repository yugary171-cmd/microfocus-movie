<script setup lang="ts">
import { isContentOperator, type ReleaseGateStatus } from "@microfocus/contracts";
import { ElButton as ElementButton, ElTooltip as ElementTooltip } from "element-plus";
import { computed, type Component } from "vue";
import { canOffline, canSubmitReview, publishDecision } from "@/policies/admin";
import type { AdminUser, DramaRecord } from "@/shared/types";

const ElTooltip = ElementTooltip as Component;
const ElButton = ElementButton as Component;

const props = defineProps<{
  user: AdminUser;
  drama: DramaRecord;
  gate: ReleaseGateStatus;
  mockMode?: boolean;
  busy?: boolean;
}>();

defineEmits<{ submit: []; publish: []; offline: [] }>();

const showActions = computed(() => isContentOperator(props.user.role));
const submit = computed(() => canSubmitReview(props.user, props.drama));
const publish = computed(() => publishDecision(props.user, props.drama, props.gate, { allowMockInternal: props.mockMode }));
const offline = computed(() => canOffline(props.user, props.drama));
</script>

<template>
  <div v-if="showActions" class="action-cluster" aria-label="剧目操作">
    <span class="action-with-help">
      <el-tooltip
        :content="submit.reason"
        :disabled="submit.allowed"
        effect="light"
        placement="bottom"
        :show-after="120"
        trigger="hover"
      >
        <span class="action-button-tooltip-target">
          <el-button class="button button--primary" native-type="button" :disabled="busy || !submit.allowed" @click="$emit('submit')">提交审核</el-button>
        </span>
      </el-tooltip>
    </span>
    <span class="action-with-help">
      <el-tooltip
        :content="publish.reason"
        :disabled="publish.allowed"
        effect="light"
        placement="bottom"
        :show-after="120"
        trigger="hover"
      >
        <span class="action-button-tooltip-target">
          <el-button class="button button--primary" native-type="button" :disabled="busy || !publish.allowed" @click="$emit('publish')">发布剧目</el-button>
        </span>
      </el-tooltip>
    </span>
    <span class="action-with-help">
      <el-tooltip
        :content="offline.reason"
        :disabled="offline.allowed"
        effect="light"
        placement="bottom"
        :show-after="120"
        trigger="hover"
      >
        <span class="action-button-tooltip-target">
          <el-button class="button button--danger" native-type="button" :disabled="busy || !offline.allowed" @click="$emit('offline')">下架剧目</el-button>
        </span>
      </el-tooltip>
    </span>
  </div>
</template>
