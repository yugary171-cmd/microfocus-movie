<script setup lang="ts">
import {
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  OTP_INPUT_LENGTH,
  AdminSetupPurpose,
} from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { adminApi } from "@/api/admin";
import { roleLabels, formatDateTime } from "@/i18n";
import type { AdminAccountSetupInfo } from "@/types/admin";

const route = useRoute();
const router = useRouter();
const state = ref<"loading" | "ready" | "invalid" | "success">("loading");
const token = ref("");
const info = ref<AdminAccountSetupInfo | null>(null);
const qrDataUrl = ref("");
const password = ref("");
const confirmPassword = ref("");
const otp = ref("");
const busy = ref(false);
const error = ref("");
const showManualKey = ref(false);

const title = computed(() => info.value?.purpose === AdminSetupPurpose.CREDENTIAL_RESET ? "重新设置登录凭据" : "开通管理员账号");

async function inspect(): Promise<void> {
  const fragmentToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token")?.trim() ?? "";
  const queryToken = typeof route.query.token === "string" ? route.query.token.trim() : "";
  const setupToken = fragmentToken || queryToken;
  if (!setupToken) {
    state.value = "invalid";
    return;
  }
  token.value = setupToken;
  try {
    info.value = await adminApi.inspectAccountSetup(setupToken);
    const qrcode = await import("qrcode");
    qrDataUrl.value = await qrcode.toDataURL(info.value.otpauthUri, {
      width: 240,
      margin: 1,
      color: { dark: "#0f1d34", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
    state.value = "ready";
  } catch {
    info.value = null;
    state.value = "invalid";
  }
}

function validate(): string {
  if (password.value.length < ADMIN_SETUP_PASSWORD_MIN_LENGTH || password.value.length > PASSWORD_MAX_LENGTH) {
    return `密码长度应为 ${ADMIN_SETUP_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 位`;
  }
  if (password.value !== confirmPassword.value) return "两次输入的密码不一致";
  if (!new RegExp(`^\\d{${OTP_INPUT_LENGTH}}$`).test(otp.value)) {
    return `请输入验证器中的 ${OTP_INPUT_LENGTH} 位验证码`;
  }
  return "";
}

async function complete(): Promise<void> {
  const validation = validate();
  if (validation) {
    error.value = validation;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await adminApi.completeAccountSetup(token.value, password.value, otp.value);
    password.value = "";
    confirmPassword.value = "";
    otp.value = "";
    token.value = "";
    state.value = "success";
  } catch {
    error.value = "开通未完成。请检查密码和验证码；若链接已失效，请联系系统管理员重新生成。";
  } finally {
    busy.value = false;
  }
}

function goToLogin(): void {
  void router.replace({ name: "login" });
}

onMounted(inspect);
</script>

<template>
  <main class="setup-page">
    <section class="setup-card" aria-live="polite">
      <header class="setup-brand"><span aria-hidden="true">M</span><div><strong>微焦</strong><small>短剧管理台</small></div></header>

      <div v-if="state === 'loading'" class="setup-state">
        <div class="setup-spinner" aria-hidden="true" />
        <h1>正在校验一次性链接</h1>
        <p>请稍候，不要关闭页面。</p>
      </div>

      <div v-else-if="state === 'invalid'" class="setup-state">
        <div class="setup-state__icon setup-state__icon--warning" aria-hidden="true">!</div>
        <h1>这个链接已无法使用</h1>
        <p>链接可能已过期、已完成使用，或已被新链接替代。为保护账号安全，本页不会确认账号是否存在。</p>
        <button class="button button--secondary" type="button" @click="goToLogin">返回登录页</button>
      </div>

      <div v-else-if="state === 'success'" class="setup-state">
        <div class="setup-state__icon setup-state__icon--success" aria-hidden="true">✓</div>
        <h1>账号已完成开通</h1>
        <p>密码和 TOTP 验证器已生效。请使用邮箱、新密码和验证器验证码登录。</p>
        <button class="button button--primary" type="button" @click="goToLogin">前往登录</button>
      </div>

      <form v-else-if="info" class="setup-form" @submit.prevent="complete">
        <div class="setup-heading"><p class="eyebrow">SECURE ACCOUNT SETUP</p><h1>{{ title }}</h1><p>此链接仅能使用一次，请在 {{ formatDateTime(info.expiresAt) }} 前完成。</p></div>
        <dl class="account-summary">
          <div><dt>姓名</dt><dd>{{ info.displayName }}</dd></div>
          <div><dt>邮箱</dt><dd>{{ info.email }}</dd></div>
          <div><dt>角色</dt><dd>{{ roleLabels[info.role] }}</dd></div>
        </dl>

        <section class="setup-section">
          <div><span class="step-number">1</span><h2>设置登录密码</h2></div>
          <label class="field"><span>新密码 *</span><input v-model="password" type="password" autocomplete="new-password" :minlength="ADMIN_SETUP_PASSWORD_MIN_LENGTH" :maxlength="PASSWORD_MAX_LENGTH" required /><small>使用 {{ ADMIN_SETUP_PASSWORD_MIN_LENGTH }}–{{ PASSWORD_MAX_LENGTH }} 位密码，不要与其他网站共用。</small></label>
          <label class="field"><span>确认新密码 *</span><input v-model="confirmPassword" type="password" autocomplete="new-password" :minlength="ADMIN_SETUP_PASSWORD_MIN_LENGTH" :maxlength="PASSWORD_MAX_LENGTH" required /></label>
        </section>

        <section class="setup-section">
          <div><span class="step-number">2</span><h2>绑定 TOTP 验证器</h2></div>
          <p>用任意兼容 TOTP 的验证器扫描二维码。二维码和手动密钥只用于本次绑定，请勿转发。</p>
          <div class="totp-box">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="TOTP 验证器绑定二维码" width="240" height="240" />
            <div>
              <strong>无法扫码？</strong>
              <button class="manual-toggle" type="button" @click="showManualKey = !showManualKey">{{ showManualKey ? '隐藏手动密钥' : '显示手动密钥' }}</button>
              <code v-if="showManualKey">{{ info.manualKey }}</code>
            </div>
          </div>
          <label class="field"><span>验证器验证码 *</span><input v-model="otp" inputmode="numeric" autocomplete="one-time-code" :maxlength="OTP_INPUT_LENGTH" pattern="[0-9]*" required /><small>输入验证器当前显示的 {{ OTP_INPUT_LENGTH }} 位数字。</small></label>
        </section>

        <div v-if="error" class="setup-error" role="alert">{{ error }}</div>
        <button class="button button--primary setup-submit" type="submit" :disabled="busy">{{ busy ? '正在安全开通…' : '完成开通' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.setup-page { min-height: 100vh; display: grid; place-items: center; padding: 32px 18px; background: radial-gradient(circle at 20% 0%, #e9efff 0, transparent 36%), #f3f5f8; }
.setup-card { width: min(720px, 100%); overflow: hidden; border: 1px solid #dfe5ed; border-radius: 18px; background: #fff; box-shadow: 0 20px 60px rgba(20, 35, 60, .12); }
.setup-brand { display: flex; align-items: center; gap: 10px; padding: 18px 24px; color: #fff; background: #0f1d34; }
.setup-brand > span { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; background: #4166d8; font-weight: 800; }
.setup-brand div { display: grid; }
.setup-brand small { color: #aab7cb; }
.setup-form { display: grid; gap: 22px; padding: 28px; }
.setup-heading h1 { margin-bottom: 8px; }
.setup-heading p { margin-bottom: 0; color: var(--color-muted); }
.account-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 16px; border-radius: 12px; background: #f5f7fa; }
.account-summary div { min-width: 0; padding: 0 14px; border-right: 1px solid #dfe5ed; }
.account-summary div:first-child { padding-left: 0; }
.account-summary div:last-child { padding-right: 0; border-right: 0; }
.account-summary dt { color: var(--color-muted); font-size: 12px; }
.account-summary dd { margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; font-weight: 700; }
.setup-section { display: grid; gap: 14px; padding-top: 20px; border-top: 1px solid #e4e8ef; }
.setup-section > div:first-child { display: flex; align-items: center; gap: 10px; }
.setup-section h2, .setup-section p { margin-bottom: 0; }
.setup-section p { color: var(--color-muted); }
.step-number { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: #fff; background: var(--color-primary); font-size: 13px; font-weight: 800; }
.totp-box { display: grid; grid-template-columns: 240px 1fr; gap: 22px; align-items: center; padding: 14px; border: 1px solid #dfe5ed; border-radius: 12px; }
.totp-box img { display: block; border-radius: 8px; }
.totp-box > div { display: grid; gap: 9px; align-content: center; }
.manual-toggle { justify-self: start; padding: 0; border: 0; color: var(--color-primary); background: transparent; cursor: pointer; font-weight: 700; }
.totp-box code { display: block; padding: 10px; overflow-wrap: anywhere; border-radius: 7px; color: #263850; background: #edf1f6; font-size: 12px; }
.setup-error { padding: 12px; border-radius: 9px; color: #8f1f34; background: var(--color-danger-soft); }
.setup-submit { width: 100%; min-height: 46px; }
.setup-state { display: grid; justify-items: center; gap: 12px; padding: 68px 28px; text-align: center; }
.setup-state h1, .setup-state p { margin-bottom: 0; }
.setup-state p { max-width: 500px; color: var(--color-muted); }
.setup-state__icon { display: grid; width: 52px; height: 52px; place-items: center; border-radius: 50%; font-size: 24px; font-weight: 800; }
.setup-state__icon--warning { color: #9b5c07; background: #fff0d4; }
.setup-state__icon--success { color: #1d7a4b; background: #daf5e7; }
.setup-spinner { width: 38px; height: 38px; border: 4px solid #dce3ef; border-top-color: var(--color-primary); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) {
  .setup-form { padding: 22px 18px; }
  .account-summary { grid-template-columns: 1fr; gap: 12px; }
  .account-summary div, .account-summary div:first-child, .account-summary div:last-child { padding: 0; border-right: 0; }
  .totp-box { grid-template-columns: 1fr; justify-items: center; }
  .totp-box > div { justify-items: center; text-align: center; }
}
</style>
