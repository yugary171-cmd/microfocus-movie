<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isNavigationItemActive, navigationItems } from "@/config/navigation";
import { roleLabels } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import ModeBanner from "@/components/ModeBanner.vue";
import Icon from "@/components/Icon.vue";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);

const items = computed(() => {
  const role = auth.user?.role;
  return navigationItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
});

function logout(): void {
  auth.logout();
  void router.replace({ name: "login" });
}

function unauthorized(): void {
  logout();
}

onMounted(() => window.addEventListener("admin:unauthorized", unauthorized));
onBeforeUnmount(() => window.removeEventListener("admin:unauthorized", unauthorized));
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <div class="app-shell">
    <aside class="sidebar" :class="{ 'is-open': menuOpen }">
      <div class="brand">
        <span class="brand__mark" aria-hidden="true">M</span>
        <span><strong>微焦</strong><small>短剧管理台</small></span>
      </div>
      <nav aria-label="主导航">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          active-class="nav-item--route-active"
          exact-active-class="nav-item--route-exact"
          :class="{ 'is-active': isNavigationItemActive(route.path, item.to) }"
          @click="menuOpen = false"
        >
          <span class="nav-item__icon"><Icon :name="item.icon" /></span>
          <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
        </RouterLink>
      </nav>
      <div v-if="auth.user" class="sidebar-user">
        <span class="avatar" aria-hidden="true">{{ auth.user.name.slice(0, 1) }}</span>
        <span class="sidebar-user__meta has-tooltip" tabindex="0" aria-describedby="sidebar-user-tooltip">
          <strong>{{ auth.user.name }}</strong>
          <small>{{ roleLabels[auth.user.role] }}</small>
          <span id="sidebar-user-tooltip" class="tooltip tooltip--above" role="tooltip">{{ auth.user.email }}</span>
        </span>
        <button class="icon-button" type="button" aria-label="退出登录" title="退出登录" @click="logout"><Icon name="logout" /></button>
      </div>
    </aside>
    <button
      v-if="menuOpen"
      class="sidebar-scrim"
      type="button"
      aria-label="关闭导航"
      @click="menuOpen = false"
    />
    <div class="app-main">
      <header class="topbar">
        <button class="icon-button mobile-menu-button" type="button" :aria-expanded="menuOpen" aria-label="打开导航" @click="menuOpen = !menuOpen"><Icon name="menu" /></button>
        <div><strong>内容安全与运营中心</strong><small>全流程可审计 · 操作按角色授权</small></div>
        <span class="environment-pill"><span aria-hidden="true" />{{ auth.user ? roleLabels[auth.user.role] : "未登录" }}</span>
      </header>
      <ModeBanner />
      <main id="main-content" class="content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
