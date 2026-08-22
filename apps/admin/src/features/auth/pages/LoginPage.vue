<script setup lang="ts">
import { ASSIGNABLE_ADMIN_ROLES, ADMIN_LOGIN_ID_MAX_LENGTH, ADMIN_LOGIN_ID_PATTERN_SOURCE, OTP_INPUT_LENGTH, OTP_INPUT_PATTERN, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@microfocus/contracts";
import { ElButton as ElementButton, ElInput as ElementInput, ElOption as ElementOption, ElSelect as ElementSelect } from "element-plus";
import { type Component } from "vue";
import { useLoginPage } from "@/features/auth/composables/useLoginPage";
import { roleLabels } from "@/shared/constants/labels";
import { Icon, PasswordField } from "@/shared/components";

const ElInput = ElementInput as Component;
const ElButton = ElementButton as Component;
const ElOption = ElementOption as Component;
const ElSelect = ElementSelect as Component;

const { mode, email, password, otp, mockRole, busy, error, submit } = useLoginPage();
</script>

<template>
  <main :class="$style['login-page']">
    <section :class="$style['login-intro']" aria-labelledby="login-title">
      <div :class="$style['login-brand']"><span aria-hidden="true">M</span><strong>微焦短剧</strong></div>
      <div>
        <p class="eyebrow">CONTENT OPERATIONS</p>
        <h1 id="login-title">每一次发布，<br />都有据可查。</h1>
        <p>连接内容生产、版权资料、媒体审核和运营安全控制的轻量工作台。</p>
      </div>
      <ul :class="$style['login-features']">
        <li><Icon name="check" />基于角色的操作边界</li>
        <li><Icon name="check" />发布前合规闸门</li>
        <li><Icon name="check" />关键操作审计留痕</li>
      </ul>
    </section>
    <section :class="$style['login-card']" aria-label="登录表单">
      <div>
        <p class="eyebrow">ADMIN CONSOLE</p>
        <h2>登录管理台</h2>
        <p>使用内部账号继续</p>
      </div>
      <div v-if="mode === 'mock'" :class="$style['login-mock-notice']" role="status">
        <strong>演示 Mock 模式</strong>
        <span>不会连接真实账号或云服务；输入任意符合格式的登录名、密码和 {{ OTP_INPUT_LENGTH }} 位验证码即可体验。登录名只是标识，不必是能收信的邮箱。</span>
      </div>
      <form @submit.prevent="submit">
        <label class="field">
          <span>登录名</span>
          <el-input
            v-model="email"
            class="admin-input"
            type="text"
            autocomplete="username"
            required
            :maxlength="ADMIN_LOGIN_ID_MAX_LENGTH"
            :pattern="ADMIN_LOGIN_ID_PATTERN_SOURCE"
            placeholder="name 或 name@company.com"
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
          <el-input
            v-model="otp"
            class="admin-input"
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
        <label v-if="mode === 'mock'" class="field">
          <span>演示角色</span>
          <el-select v-model="mockRole" class="admin-select" aria-label="演示角色">
            <el-option v-for="role in ASSIGNABLE_ADMIN_ROLES" :key="role" :label="roleLabels[role]" :value="role" />
          </el-select>
        </label>
        <p v-if="error" :class="$style['form-error']" role="alert">{{ error }}</p>
        <el-button :class="['button', 'button--primary', $style['login-submit']]" native-type="submit" :disabled="busy">
          {{ busy ? "正在验证…" : "安全登录" }}
        </el-button>
      </form>
      <p :class="$style['login-footnote']">真实模式仅接受已由部署/运维创建的管理员账号，不提供开放注册。访问行为将进入审计日志。</p>
    </section>
  </main>
</template>

<style module lang="scss" src="../styles/login.module.scss"></style>
