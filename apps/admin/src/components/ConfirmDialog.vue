<script setup lang="ts">
import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH } from "@microfocus/contracts";
import { ElInput as ElementInput } from "element-plus";
import { computed, nextTick, ref, watch, type Component } from "vue";
import Icon from "./Icon.vue";

const ElInput = ElementInput as Component;

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: "primary" | "danger";
    busy?: boolean;
    requireReason?: boolean;
    reasonLabel?: string;
    reasonMinLength?: number;
    reasonMaxLength?: number;
  }>(),
  {
    confirmLabel: "确认",
    tone: "primary",
    busy: false,
    requireReason: false,
    reasonLabel: "操作原因",
    reasonMinLength: ADMIN_REASON_MIN_LENGTH,
    reasonMaxLength: ADMIN_REASON_MAX_LENGTH,
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [reason: string];
}>();

const reason = ref("");
const cancelButton = ref<HTMLButtonElement | null>(null);
const reasonReady = computed(() => {
  if (!props.requireReason) return true;
  const length = reason.value.trim().length;
  return length >= props.reasonMinLength && length <= props.reasonMaxLength;
});

watch(
  () => props.open,
  async (open) => {
    if (open) {
      reason.value = "";
      await nextTick();
      cancelButton.value?.focus();
    }
  },
);

function confirm(): void {
  if (!reasonReady.value) return;
  emit("confirm", reason.value.trim());
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @keydown.esc="!busy && $emit('close')">
      <section
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="`${title}-dialog-title`"
        :aria-describedby="`${title}-dialog-description`"
      >
        <div class="dialog__icon" :class="`dialog__icon--${tone}`"><Icon :name="tone === 'danger' ? 'warning' : 'help'" /></div>
        <h2 :id="`${title}-dialog-title`">{{ title }}</h2>
        <p :id="`${title}-dialog-description`">{{ message }}</p>
        <label v-if="requireReason" class="field">
          <span>{{ reasonLabel }} <span aria-hidden="true">*</span></span>
          <el-input
            v-model="reason"
            class="admin-input"
            type="textarea"
            :rows="3"
            :minlength="reasonMinLength"
            :maxlength="reasonMaxLength"
            :disabled="busy"
            required
            @keydown.ctrl.enter="confirm"
          />
        </label>
        <div class="dialog__actions">
          <button ref="cancelButton" class="button button--ghost" type="button" :disabled="busy" @click="$emit('close')">取消</button>
          <button
            class="button"
            :class="tone === 'danger' ? 'button--danger' : 'button--primary'"
            type="button"
            :disabled="busy || !reasonReady"
            @click="confirm"
          >
            {{ busy ? "处理中…" : confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
