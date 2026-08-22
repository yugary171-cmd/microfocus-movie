<script setup lang="ts">
import { ElInput as ElementInput } from "element-plus";
import { ref, type Component } from "vue";
import Icon from "./Icon.vue";

const ElInput = ElementInput as Component;

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
  <div :class="$style['password-field']">
    <el-input
      v-model="model"
      class="admin-input"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :minlength="minlength"
      :maxlength="maxlength"
      :required="required"
    />
    <button
      :class="['icon-button', $style['password-toggle']]"
      type="button"
      :aria-pressed="visible"
      :aria-label="visible ? '隐藏密码' : '显示密码'"
      @click="visible = !visible"
    >
      <Icon :name="visible ? 'eye-off' : 'eye'" :size="18" />
    </button>
  </div>
</template>
<style module lang="scss" src="./PasswordField.module.scss"></style>
