<script setup lang="ts">
import { AdminRole, EMAIL_MAX_LENGTH, OTP_INPUT_LENGTH, OTP_INPUT_PATTERN, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@microfocus/contracts";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import { roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import Icon from "@/components/Icon.vue";
import PasswordField from "@/components/PasswordField.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const email = ref(adminApi.mode === "mock" ? "editor@microfocus.local" : "");
const password = ref("");
const otp = ref("");
const mockRole = ref(AdminRole.EDITOR);
const busy = ref(false);
const error = ref("");

async function submit(): Promise<void> {
  error.value = "";
  const trimmedEmail = email.value.trim();
  if (trimmedEmail.length > EMAIL_MAX_LENGTH) {
    error.value = `邮箱最长 ${EMAIL_MAX_LENGTH} 个字符`;
    return;
  }
  if (password.value.length > PASSWORD_MAX_LENGTH) {
    error.value = `密码最长 ${PASSWORD_MAX_LENGTH} 个字符`;
    return;
  }
  if (password.value.length < PASSWORD_MIN_LENGTH) {
    error.value = `密码至少 ${PASSWORD_MIN_LENGTH} 个字符`;
    return;
  }
  if (otp.value.length !== OTP_INPUT_LENGTH) {
    error.value = `请输入 ${OTP_INPUT_LENGTH} 位验证码`;
    return;
  }
  busy.value = true;
  try {
    await auth.login(trimmedEmail, password.value, otp.value, mockRole.value);
    const redirect = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
      ? route.query.redirect
      : "/";
    await router.replace(redirect);
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro" aria-labelledby="login-title">
      <div class="login-brand"><span aria-hidden="true">M</span><strong>微焦短剧</strong></div>
      <div>
        <p class="eyebrow">CONTENT OPERATIONS</p>
        <h1 id="login-title">每一次发布，<br />都有据可查。</h1>
        <p>连接内容生产、版权资料、媒体审核和运营安全控制的轻量工作台。</p>
      </div>
      <ul class="login-features">
        <li><Icon name="check" />基于角色的操作边界</li>
        <li><Icon name="check" />发布前合规闸门</li>
        <li><Icon name="check" />关键操作审计留痕</li>
      </ul>
    </section>
    <section class="login-card" aria-label="登录表单">
      <div>
        <p class="eyebrow">ADMIN CONSOLE</p>
        <h2>登录管理台</h2>
        <p>使用内部账号继续</p>
      </div>
      <div v-if="adminApi.mode === 'mock'" class="login-mock-notice" role="status">
        <strong>演示 Mock 模式</strong>
        <span>不会连接真实账号或云服务；输入任意符合格式的账号、密码和 {{ OTP_INPUT_LENGTH }} 位验证码即可体验。</span>
      </div>
      <form @submit.prevent="submit">
        <label class="field">
          <span>邮箱</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            :maxlength="EMAIL_MAX_LENGTH"
            placeholder="name@company.com"
          />
        </label>
        <label class="field">
          <span>密码</span>
          <PasswordField
            v-model="password"
            autocomplete="current-password"
            :minlength="PASSWORD_MIN_LENGTH"
            :maxlength="PASSWORD_MAX_LENGTH"
          />
        </label>
        <label class="field">
          <span>一次性验证码</span>
          <input
            v-model="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            :pattern="OTP_INPUT_PATTERN"
            :minlength="OTP_INPUT_LENGTH"
            :maxlength="OTP_INPUT_LENGTH"
            required
            :placeholder="`${OTP_INPUT_LENGTH} 位验证码`"
          />
        </label>
        <label v-if="adminApi.mode === 'mock'" class="field">
          <span>演示角色</span>
          <select v-model="mockRole">
            <option v-for="role in AdminRole" :key="role" :value="role">{{ roleLabels[role] }}</option>
          </select>
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="button button--primary login-submit" type="submit" :disabled="busy">
          {{ busy ? "正在验证…" : "安全登录" }}
        </button>
      </form>
      <p class="login-footnote">真实模式仅接受已由部署/运维创建的管理员账号，不提供开放注册。访问行为将进入审计日志。</p>
    </section>
  </main>
</template>

<style scoped>
.login-page { display: grid; min-height: 100vh; grid-template-columns: minmax(360px, .9fr) minmax(440px, 1.1fr); background: #fff; }
.login-intro { display: flex; min-height: 100vh; justify-content: space-between; flex-direction: column; padding: clamp(34px, 6vw, 74px); color: #eaf0fa; background: radial-gradient(circle at 75% 25%, #274178 0, transparent 38%), linear-gradient(145deg, #111a2d, #172641); }
.login-brand { display: flex; align-items: center; gap: 12px; font-size: 17px; letter-spacing: .06em; }
.login-brand span { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 11px; background: #4268d8; font-weight: 800; }
.login-intro h1 { max-width: 520px; margin-bottom: 20px; font-size: clamp(40px, 5vw, 63px); line-height: 1.12; letter-spacing: -.05em; }
.login-intro p:not(.eyebrow) { max-width: 480px; color: #aebbd1; font-size: 16px; }
.login-intro .eyebrow { color: #88a5fa; }
.login-features { display: flex; flex-wrap: wrap; gap: 18px; margin: 0; padding: 0; color: #b9c5d7; list-style: none; font-size: 12px; }
.login-features span { margin-right: 5px; color: #82a1fa; }
.login-card { align-self: center; width: min(440px, calc(100% - 48px)); margin: auto; padding: 34px; border: 1px solid var(--color-border); border-radius: 16px; background: #fff; box-shadow: var(--shadow-md); }
.login-card > div:first-child p:last-child { color: var(--color-muted); }
.login-card form { display: grid; gap: 16px; margin-top: 23px; }
.login-mock-notice { display: flex; flex-direction: column; margin-top: 20px; padding: 11px 13px; border: 1px solid #f1d18e; border-radius: 8px; color: #71450a; background: #fff8e8; font-size: 12px; }
.form-error { margin: 0; padding: 9px 11px; border-radius: 7px; color: var(--color-danger); background: var(--color-danger-soft); font-size: 12px; }
.login-submit { width: 100%; min-height: 44px; margin-top: 2px; }
.login-footnote { margin: 20px 0 0; color: var(--color-muted); font-size: 11px; text-align: center; }
@media (max-width: 800px) {
  .login-page { display: flex; min-height: 100vh; flex-direction: column; background: #f5f7fb; }
  .login-intro { min-height: 230px; padding: 27px 24px 44px; }
  .login-intro > div:nth-child(2) { margin-top: 35px; }
  .login-intro h1 { margin-bottom: 10px; font-size: 35px; }
  .login-intro p:not(.eyebrow), .login-features { display: none; }
  .login-card { width: calc(100% - 28px); margin: -24px auto 20px; padding: 25px 20px; }
}
</style>
