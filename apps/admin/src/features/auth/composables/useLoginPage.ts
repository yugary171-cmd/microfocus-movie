import {
  ADMIN_LOGIN_ID_MAX_LENGTH,
  AdminRole,
  isAdminLoginId,
  OTP_INPUT_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@microfocus/contracts";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toErrorMessage } from "@/infrastructure/api";
import { authApi } from "@/features/auth/api";
import { useAuthStore } from "@/infrastructure/stores";

export function useLoginPage() {
  const auth = useAuthStore();
  const route = useRoute();
  const router = useRouter();
  const mode = authApi.mode;
  const email = ref(mode === "mock" ? "editor@microfocus.local" : "");
  const password = ref("");
  const otp = ref("");
  const mockRole = ref(AdminRole.EDITOR);
  const busy = ref(false);
  const error = ref("");

  async function submit(): Promise<void> {
    error.value = "";
    const trimmedEmail = email.value.trim();
    if (trimmedEmail.length > ADMIN_LOGIN_ID_MAX_LENGTH) {
      error.value = `登录名最长 ${ADMIN_LOGIN_ID_MAX_LENGTH} 个字符`;
      return;
    }
    if (!isAdminLoginId(trimmedEmail)) {
      error.value = "登录名只能包含字母、数字、点、下划线和可选的 @域";
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
      await auth.login(trimmedEmail.toLowerCase(), password.value, otp.value, mockRole.value);
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

  return {
    mode,
    email,
    password,
    otp,
    mockRole,
    busy,
    error,
    submit,
  };
}
