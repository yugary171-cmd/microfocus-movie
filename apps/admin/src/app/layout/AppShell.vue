<script setup lang="ts">
import { Bell, ChatDotRound, CollectionTag, DocumentChecked, Finished, House, Operation, UserFilled, VideoCamera } from "@element-plus/icons-vue";
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isNavigationItemActive, navigationItems, type NavigationIcon } from "@/app/navigation";
import { roleLabels } from "@/shared/constants/labels";
import { useAuthStore } from "@/infrastructure/stores";
import { Icon, ModeBanner } from "@/shared/components";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const menuOpen = ref(false);
const navigationIcons: Record<NavigationIcon, Component> = {
  home: House,
  dramas: VideoCamera,
  reviews: Finished,
  tags: CollectionTag,
  operations: Operation,
  audit: DocumentChecked,
  notifications: Bell,
  feedback: ChatDotRound,
  accounts: UserFilled,
};

const items = computed(() => {
  const role = auth.user?.role;
  return navigationItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
});

async function logout(): Promise<void> {
  await auth.logout();
  void router.replace({ name: "login" });
}

function unauthorized(): void {
  void logout();
}

onMounted(() => window.addEventListener("admin:unauthorized", unauthorized));
onBeforeUnmount(() => window.removeEventListener("admin:unauthorized", unauthorized));
</script>

<template>
  <a :class="$style['skip-link']" href="#main-content">跳到主要内容</a>
  <div :class="$style['app-shell']">
    <aside :class="[$style.sidebar, menuOpen ? $style['is-open'] : '']">
      <div :class="$style.brand">
        <span :class="$style['brand__mark']" aria-hidden="true">M</span>
        <span><strong>微焦</strong><small>短剧管理台</small></span>
      </div>
      <nav aria-label="主导航">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          :class="[$style['nav-item'], isNavigationItemActive(route.path, item.to) ? $style['is-active'] : '']"
          active-class="nav-item--route-active"
          exact-active-class="nav-item--route-exact"
          @click="menuOpen = false"
        >
          <span data-testid="nav-item-icon" :class="$style['nav-item__icon']"><component :is="navigationIcons[item.icon]" aria-hidden="true" /></span>
          <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
        </RouterLink>
      </nav>
      <div v-if="auth.user" :class="$style['sidebar-user']">
        <span :class="$style.avatar" aria-hidden="true">{{ auth.user.name.slice(0, 1) }}</span>
        <span data-testid="sidebar-user-meta" :class="[$style['sidebar-user__meta'], $style['has-tooltip']]" tabindex="0" aria-describedby="sidebar-user-tooltip">
          <strong>{{ auth.user.name }}</strong>
          <small>{{ roleLabels[auth.user.role] }}</small>
          <span id="sidebar-user-tooltip" :class="[$style.tooltip, $style['tooltip--above']]" role="tooltip">{{ auth.user.email }}</span>
        </span>
        <button class="icon-button" type="button" aria-label="退出登录" title="退出登录" @click="logout"><Icon name="logout" /></button>
      </div>
    </aside>
    <button
      v-if="menuOpen"
      :class="$style['sidebar-scrim']"
      type="button"
      aria-label="关闭导航"
      @click="menuOpen = false"
    />
    <div :class="$style['app-main']">
      <header :class="$style.topbar">
        <button :class="['icon-button', $style['mobile-menu-button']]" type="button" :aria-expanded="menuOpen" aria-label="打开导航" @click="menuOpen = !menuOpen"><Icon name="menu" /></button>
        <div><strong>内容安全与运营中心</strong><small>全流程可审计 · 操作按角色授权</small></div>
        <span :class="$style['environment-pill']"><span aria-hidden="true" />{{ auth.user ? roleLabels[auth.user.role] : "未登录" }}</span>
      </header>
      <ModeBanner />
      <main id="main-content" :class="$style.content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
<style module lang="scss" src="./AppShell.module.scss"></style>
