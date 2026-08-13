<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

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
  }>(),
  {
    confirmLabel: "确认",
    tone: "primary",
    busy: false,
    requireReason: false,
    reasonLabel: "操作原因",
  },
);

const emit = defineEmits<{
  close: [];
  confirm: [reason: string];
}>();

const reason = ref("");
const cancelButton = ref<HTMLButtonElement | null>(null);

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
  if (props.requireReason && !reason.value.trim()) return;
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
        <div class="dialog__icon" :class="`dialog__icon--${tone}`" aria-hidden="true">{{ tone === "danger" ? "!" : "?" }}</div>
        <h2 :id="`${title}-dialog-title`">{{ title }}</h2>
        <p :id="`${title}-dialog-description`">{{ message }}</p>
        <label v-if="requireReason" class="field">
          <span>{{ reasonLabel }} <span aria-hidden="true">*</span></span>
          <textarea v-model="reason" rows="3" :disabled="busy" required @keydown.ctrl.enter="confirm" />
        </label>
        <div class="dialog__actions">
          <button ref="cancelButton" class="button button--ghost" type="button" :disabled="busy" @click="$emit('close')">取消</button>
          <button
            class="button"
            :class="tone === 'danger' ? 'button--danger' : 'button--primary'"
            type="button"
            :disabled="busy || (requireReason && !reason.trim())"
            @click="confirm"
          >
            {{ busy ? "处理中…" : confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
