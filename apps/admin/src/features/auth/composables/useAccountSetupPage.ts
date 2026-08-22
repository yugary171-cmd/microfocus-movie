import {
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  OTP_INPUT_LENGTH,
  AdminSetupPurpose,
} from "@microfocus/contracts";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { authApi } from "@/features/auth/api";
import type { AdminAccountSetupInfo } from "@/shared/types";

type AccountSetupState = "loading" | "ready" | "invalid" | "success";

export function useAccountSetupPage() {
  const router = useRouter();
  const state = ref<AccountSetupState>("loading");
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
    const setupToken = fragmentToken;
    if (!setupToken) {
      state.value = "invalid";
      return;
    }
    token.value = setupToken;
    try {
      info.value = await authApi.inspectAccountSetup(setupToken);
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
      await authApi.completeAccountSetup(token.value, password.value, otp.value);
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

  return {
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
  };
}
