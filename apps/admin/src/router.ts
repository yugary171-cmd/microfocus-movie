import { createRouter, createWebHistory } from "vue-router";
import { AdminRole } from "@microfocus/contracts";
import AppShell from "@/components/layout/AppShell.vue";
import { useAuthStore } from "@/stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
    {
      path: "/account-setup",
      name: "account-setup",
      component: () => import("@/views/AccountSetupView.vue"),
    },
    {
      path: "/",
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: "", name: "dashboard", component: () => import("@/views/DashboardView.vue") },
        { path: "dramas", name: "dramas", component: () => import("@/views/DramaListView.vue") },
        { path: "dramas/new", name: "drama-new", component: () => import("@/views/DramaEditorView.vue") },
        { path: "dramas/:id", name: "drama-edit", component: () => import("@/views/DramaEditorView.vue") },
        { path: "reviews", name: "reviews", component: () => import("@/views/ReviewQueueView.vue") },
        { path: "operations", name: "operations", component: () => import("@/views/OperationsView.vue") },
        { path: "audit", name: "audit", component: () => import("@/views/AuditLogView.vue") },
        {
          path: "accounts",
          name: "accounts",
          component: () => import("@/views/AdminAccountsView.vue"),
          meta: { roles: [AdminRole.ADMIN] },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: "login", query: { redirect: to.fullPath } };
  const roles = Array.isArray(to.meta.roles) ? to.meta.roles : [];
  if (roles.length > 0 && (!auth.user || !roles.includes(auth.user.role))) {
    return { name: "dashboard" };
  }
  if (to.name === "login" && auth.isAuthenticated) return { name: "dashboard" };
  return true;
});
