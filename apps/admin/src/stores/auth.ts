import { AdminRole } from "@microfocus/contracts";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { adminApi } from "@/api/admin";
import { clearSessionToken, getSessionUser, setSessionToken, setSessionUser } from "@/api/client";
import type { AdminUser } from "@/types/admin";

const SESSION_USER_KEY = "microfocus.admin.user";

function readUser(): AdminUser | null {
  return getSessionUser();
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AdminUser | null>(readUser());
  const isAuthenticated = computed(() => Boolean(user.value && adminApi.hasSession()));
  let restorePromise: Promise<void> | null = null;
  let restored = false;

  async function login(email: string, password: string, otp: string, role: AdminRole): Promise<void> {
    const session = await adminApi.login(email, password, otp, role);
    setSessionToken(session.accessToken);
    setSessionUser(session.user);
    user.value = session.user;
    restored = true;
  }

  async function restoreSession(): Promise<void> {
    if (restored) return;
    if (restorePromise) return restorePromise;
    restorePromise = (async () => {
      restored = true;
      if (adminApi.mode === "mock") return;
      try {
        const session = await adminApi.refresh();
        setSessionToken(session.accessToken);
        setSessionUser(session.user);
        user.value = session.user;
      } catch {
        clearSessionToken();
        sessionStorage.removeItem(SESSION_USER_KEY);
        user.value = null;
      }
    })();
    try {
      await restorePromise;
    } finally {
      restorePromise = null;
    }
  }

  async function logout(): Promise<void> {
    try {
      await adminApi.logout();
    } finally {
      clearSessionToken();
      sessionStorage.removeItem(SESSION_USER_KEY);
      user.value = null;
      restored = true;
    }
  }

  return { user, isAuthenticated, login, restoreSession, logout };
});
