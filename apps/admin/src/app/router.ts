import { createRouter, createWebHistory } from "vue-router";
import { AdminRole } from "@microfocus/contracts";
import AppShell from "@/app/layout/AppShell.vue";
import { useAuthStore } from "@/infrastructure/stores";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("@/features/auth/pages/LoginPage.vue") },
    { path: "/account-setup", name: "account-setup", component: () => import("@/features/auth/pages/AccountSetupPage.vue") },
    {
      path: "/",
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: "", name: "dashboard", component: () => import("@/features/dashboard/pages/DashboardPage.vue") },
        { path: "dramas", name: "dramas", component: () => import("@/features/dramas/pages/DramaListPage.vue") },
        { path: "dramas/new", name: "drama-new", component: () => import("@/features/dramas/pages/DramaEditorPage.vue") },
        { path: "dramas/:id", name: "drama-edit", component: () => import("@/features/dramas/pages/DramaEditorPage.vue") },
        { path: "reviews", name: "reviews", component: () => import("@/features/reviews/pages/ReviewQueuePage.vue") },
        { path: "tags", name: "tags", component: () => import("@/features/tags/pages/TagLibraryPage.vue"), meta: { roles: [AdminRole.ADMIN] } },
        { path: "operations", name: "operations", component: () => import("@/features/operations/pages/OperationsPage.vue") },
        { path: "audit", name: "audit", component: () => import("@/features/audit/pages/AuditLogPage.vue") },
        { path: "notifications", name: "notifications", component: () => import("@/features/notifications/pages/NotificationsPage.vue"), meta: { roles: [AdminRole.ADMIN] } },
        { path: "feedback", name: "feedback", component: () => import("@/features/feedback/pages/FeedbackPage.vue"), meta: { roles: [AdminRole.ADMIN] } },
        { path: "accounts", name: "accounts", component: () => import("@/features/accounts/pages/AdminAccountsPage.vue"), meta: { roles: [AdminRole.ADMIN] } },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth || to.name === "login") await auth.restoreSession();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: "login", query: { redirect: to.fullPath } };
  const roles = Array.isArray(to.meta.roles) ? to.meta.roles : [];
  if (roles.length > 0 && (!auth.user || !roles.includes(auth.user.role))) return { name: "dashboard" };
  if (to.name === "login" && auth.isAuthenticated) return { name: "dashboard" };
  return true;
});
