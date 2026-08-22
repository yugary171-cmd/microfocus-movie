<script setup lang="ts">
import {
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  OTP_INPUT_LENGTH,
} from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput } from "element-plus";
import { type Component } from "vue";
import { useAccountSetupPage } from "@/features/auth/composables/useAccountSetupPage";
import { PasswordField } from "@/shared/components";
import { roleLabels } from "@/shared/constants/labels";
import { formatDateTime } from "@/shared/utils/format";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;

const {
  state,
  info,
  qrDataUrl,
  password,
  confirmPassword,
  otp,
  busy,
  error,
  showManualKey,
  title,
  complete,
  goToLogin,
} = useAccountSetupPage();
</script>

<template>
  <main :class="$style['setup-page']">
    <section :class="$style['setup-card']" aria-live="polite">
      <header :class="$style['setup-brand']"><span aria-hidden="true">M</span><div><strong>微焦</strong><small>短剧管理台</small></div></header>

      <div v-if="state === 'loading'" :class="$style['setup-state']">
        <div :class="$style['setup-spinner']" aria-hidden="true" />
        <h1>正在校验一次性链接</h1>
        <p>请稍候，不要关闭页面。</p>
      </div>

      <div v-else-if="state === 'invalid'" :class="$style['setup-state']">
        <div :class="[$style['setup-state__icon'], $style['setup-state__icon--warning']]" aria-hidden="true">!</div>
        <h1>这个链接已无法使用</h1>
        <p>链接可能已过期、已完成使用，或已被新链接替代。为保护账号安全，本页不会确认账号是否存在。</p>
        <el-button class="button button--secondary" native-type="button" @click="goToLogin">返回登录页</el-button>
      </div>

      <div v-else-if="state === 'success'" :class="$style['setup-state']">
        <div :class="[$style['setup-state__icon'], $style['setup-state__icon--success']]" aria-hidden="true">✓</div>
        <h1>账号已完成开通</h1>
        <p>密码和 TOTP 验证器已生效。请使用邮箱、新密码和验证器验证码登录。</p>
        <el-button class="button button--primary" native-type="button" @click="goToLogin">前往登录</el-button>
      </div>

      <form v-else-if="info" :class="$style['setup-form']" @submit.prevent="complete">
        <div :class="$style['setup-heading']"><p class="eyebrow">SECURE ACCOUNT SETUP</p><h1>{{ title }}</h1><p>此链接仅能使用一次，请在 {{ formatDateTime(info.expiresAt) }} 前完成。</p></div>
        <dl :class="$style['account-summary']">
          <div><dt>姓名</dt><dd>{{ info.displayName }}</dd></div>
          <div><dt>登录名</dt><dd>{{ info.email }}</dd></div>
          <div><dt>角色</dt><dd>{{ roleLabels[info.role] }}</dd></div>
        </dl>

        <section :class="$style['setup-section']">
          <div><span :class="$style['step-number']">1</span><h2>设置登录密码</h2></div>
          <label class="field"><span>新密码 *</span><PasswordField v-model="password" autocomplete="new-password" :minlength="ADMIN_SETUP_PASSWORD_MIN_LENGTH" :maxlength="PASSWORD_MAX_LENGTH" /><small>使用 {{ ADMIN_SETUP_PASSWORD_MIN_LENGTH }}–{{ PASSWORD_MAX_LENGTH }} 位密码，不要与其他网站共用。</small></label>
          <label class="field"><span>确认新密码 *</span><PasswordField v-model="confirmPassword" autocomplete="new-password" :minlength="ADMIN_SETUP_PASSWORD_MIN_LENGTH" :maxlength="PASSWORD_MAX_LENGTH" /></label>
        </section>

        <section :class="$style['setup-section']">
          <div><span :class="$style['step-number']">2</span><h2>绑定 TOTP 验证器</h2></div>
          <p>用任意兼容 TOTP 的验证器扫描二维码。二维码和手动密钥只用于本次绑定，请勿转发。</p>
          <div :class="$style['totp-box']">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="TOTP 验证器绑定二维码" width="240" height="240" />
            <div>
              <strong>无法扫码？</strong>
              <button :class="$style['manual-toggle']" type="button" @click="showManualKey = !showManualKey">{{ showManualKey ? '隐藏手动密钥' : '显示手动密钥' }}</button>
              <code v-if="showManualKey">{{ info.manualKey }}</code>
            </div>
          </div>
          <label class="field"><span>验证器验证码 *</span><el-input v-model="otp" class="admin-input" inputmode="numeric" autocomplete="one-time-code" :maxlength="OTP_INPUT_LENGTH" pattern="[0-9]*" required /><small>输入验证器当前显示的 {{ OTP_INPUT_LENGTH }} 位数字。</small></label>
        </section>

        <div v-if="error" :class="$style['setup-error']" role="alert">{{ error }}</div>
        <el-button :class="['button', 'button--primary', $style['setup-submit']]" native-type="submit" :disabled="busy">{{ busy ? '正在安全开通…' : '完成开通' }}</el-button>
      </form>
    </section>
  </main>
</template>

<style module lang="scss" src="../styles/account-setup.module.scss"></style>
