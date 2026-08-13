<script setup lang="ts">
import { AdminRole, type ReleaseGateStatus } from "@microfocus/contracts";
import { computed } from "vue";
import { canOffline, canSubmitReview, publishDecision } from "@/policies/admin";
import type { AdminUser, DramaRecord } from "@/types/admin";

const props = defineProps<{
  user: AdminUser;
  drama: DramaRecord;
  gate: ReleaseGateStatus;
  mockMode?: boolean;
  busy?: boolean;
}>();

defineEmits<{ submit: []; publish: []; offline: [] }>();

const submit = computed(() => canSubmitReview(props.user, props.drama));
const publish = computed(() => publishDecision(props.user, props.drama, props.gate, { allowMockInternal: props.mockMode }));
const offline = computed(() => canOffline(props.user, props.drama));
</script>

<template>
  <div class="action-cluster" aria-label="剧目操作">
    <span v-if="user.role === AdminRole.EDITOR" class="action-with-help">
      <button class="button button--primary" type="button" :disabled="busy || !submit.allowed" @click="$emit('submit')">提交审核</button>
      <small v-if="!submit.allowed">{{ submit.reason }}</small>
    </span>
    <span v-if="user.role === AdminRole.ADMIN" class="action-with-help">
      <button class="button button--primary" type="button" :disabled="busy || !publish.allowed" @click="$emit('publish')">发布剧目</button>
      <small v-if="!publish.allowed">{{ publish.reason }}</small>
    </span>
    <span v-if="user.role === AdminRole.ADMIN" class="action-with-help">
      <button class="button button--danger" type="button" :disabled="busy || !offline.allowed" @click="$emit('offline')">下架剧目</button>
      <small v-if="!offline.allowed">{{ offline.reason }}</small>
    </span>
  </div>
</template>
