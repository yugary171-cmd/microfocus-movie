import { AdminRole } from "@microfocus/contracts";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell.vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ replace: vi.fn() }),
  RouterLink: { name: "RouterLink", template: "<a><slot /></a>" },
  RouterView: { name: "RouterView", template: "<div />" },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: {
      id: "admin-1",
      name: "admin@example.invalid",
      email: "admin@example.invalid",
      role: AdminRole.ADMIN,
    },
    logout: vi.fn(),
  }),
}));

describe("AppShell", () => {
  it("keeps a long account name from covering the logout control", () => {
    const wrapper = mount(AppShell, {
      global: {
        stubs: { ModeBanner: true },
      },
    });
    const name = wrapper.get(".sidebar-user__meta strong");
    expect(name.text()).toBe("admin@example.invalid");
    expect(name.attributes("title")).toBeUndefined();
    const tooltip = wrapper.get("#sidebar-user-tooltip");
    expect(tooltip.text()).toContain("admin@example.invalid");
    expect(tooltip.classes()).toContain("tooltip");
    wrapper.get('button[aria-label="退出登录"]');
    wrapper.unmount();
  });
});
