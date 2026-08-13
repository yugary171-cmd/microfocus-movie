import { AdminRole } from "@microfocus/contracts";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { adminApi } from "@/api/admin";
import { clearSessionToken, setSessionToken } from "@/api/client";
import type { AdminUser } from "@/types/admin";

const SESSION_USER_KEY = "microfocus.admin.user";

function readUser(): AdminUser | null {
  if (!adminApi.hasSession()) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AdminUser>;
    if (
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      typeof value.email !== "string" ||
      !Object.values(AdminRole).includes(value.role as AdminRole)
    ) return null;
    return value as AdminUser;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AdminUser | null>(readUser());
  const isAuthenticated = computed(() => Boolean(user.value && adminApi.hasSession()));

  async function login(email: string, password: string, otp: string, role: AdminRole): Promise<void> {
    const session = await adminApi.login(email, password, otp, role);
    setSessionToken(session.accessToken);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(session.user));
    user.value = session.user;
  }

  function logout(): void {
    clearSessionToken();
    sessionStorage.removeItem(SESSION_USER_KEY);
    user.value = null;
  }

  return { user, isAuthenticated, login, logout };
});
