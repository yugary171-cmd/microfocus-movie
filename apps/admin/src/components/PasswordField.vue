<script setup lang="ts">
import { ref } from "vue";
import Icon from "@/components/Icon.vue";

const model = defineModel<string>({ required: true });

withDefaults(
  defineProps<{
    autocomplete?: "current-password" | "new-password";
    minlength?: number;
    maxlength?: number;
    required?: boolean;
  }>(),
  {
    autocomplete: "current-password",
    required: true,
  },
);

const visible = ref(false);
</script>

<template>
  <div class="password-field">
    <input
      v-model="model"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :minlength="minlength"
      :maxlength="maxlength"
      :required="required"
    />
    <button
      class="icon-button password-toggle"
      type="button"
      :aria-pressed="visible"
      :aria-label="visible ? '隐藏密码' : '显示密码'"
      @click="visible = !visible"
    >
      <Icon :name="visible ? 'eye-off' : 'eye'" :size="18" />
    </button>
  </div>
</template>
