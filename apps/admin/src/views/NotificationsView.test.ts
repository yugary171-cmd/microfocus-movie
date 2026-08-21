import { AdminRole, SystemNotificationStatus } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationsView from "./NotificationsView.vue";

const { listNotifications, getNotification, authUser } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getNotification: vi.fn(),
  authUser: { id: "admin-1", name: "陈管理员", email: "admin@example.com", role: "ADMIN" as AdminRole },
}));

vi.mock("@/api/admin", () => ({
  adminApi: { listNotifications, getNotification, mode: "mock" },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: authUser }),
}));

function notification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "notice-1",
    title: "系统维护通知",
    body: "今晚 22:00 进行系统维护。",
    status: SystemNotificationStatus.PUBLISHED,
    publishedAt: "2026-08-20T10:00:00.000Z",
    createdAt: "2026-08-20T09:00:00.000Z",
    createdByAdminId: "admin-1",
    createdByAdminName: "陈管理员",
    ...overrides,
  };
}

const testStubs = {
  AdminTable: {
    props: ["rows", "columns", "tableClass", "actionWidth"],
    template: `<div :class="['admin-table', tableClass]"><div v-for="row in rows" :key="row.id" class="admin-table-row"><span v-for="column in columns" :key="column.key">{{ column.formatter ? column.formatter(row) : column.prop ? row[column.prop] : "" }}</span><slot name="actions" :row="row" /></div></div>`,
  },
  ElSelect: {
    props: ["modelValue"],
    emits: ["update:modelValue", "change"],
    template: "<select :value=\"modelValue\"><slot /></select>",
  },
  ElOption: {
    props: ["label", "value"],
    template: "<option :value=\"value\">{{ label }}</option>",
  },
  ElPagination: {
    props: ["currentPage", "pageSize", "total", "disabled"],
    template: '<div class="el-pagination-stub">分页</div>',
  },
};

describe("NotificationsView", () => {
  beforeEach(() => {
    listNotifications.mockReset();
    getNotification.mockReset();
  });

  it("renders list metadata without notification body", async () => {
    listNotifications.mockResolvedValue({ items: [notification()], total: 21 });
    const wrapper = mount(NotificationsView, { global: { stubs: testStubs } });
    await flushPromises();

    expect(wrapper.text()).toContain("系统维护通知");
    expect(wrapper.text()).toContain("陈管理员");
    expect(wrapper.text()).not.toContain("今晚 22:00 进行系统维护。");
    expect(wrapper.text()).toContain("查看");
    expect(wrapper.text()).toContain("每页显示：");
    expect(wrapper.find(".notification-page-size-select").exists()).toBe(true);
    expect(wrapper.text()).toContain("2026-08-20");
    expect(wrapper.text()).toContain(":00:00");
    expect(wrapper.findAll(".toolbar .field")).toHaveLength(0);
    expect(wrapper.get('input[aria-label="搜索通知"]').attributes("placeholder")).toBe("标题或正文");
    wrapper.unmount();
  });

  it("opens the editor drawer from the new notification button", async () => {
    listNotifications.mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(NotificationsView, { global: { stubs: testStubs } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "新建通知")?.trigger("click");
    expect(wrapper.get(".el-drawer").text()).toContain("纯文本通知");
    expect(wrapper.get(".el-drawer").text()).toContain("保存草稿");
    expect(wrapper.get(".el-drawer").find('input[placeholder="通知标题"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("opens a read-only drawer with the full notification content", async () => {
    const item = notification();
    listNotifications.mockResolvedValue({ items: [item], total: 1 });
    getNotification.mockResolvedValue(item);
    const wrapper = mount(NotificationsView, { global: { stubs: testStubs } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "查看")?.trigger("click");
    await flushPromises();

    expect(getNotification).toHaveBeenCalledWith("notice-1");
    expect(wrapper.get(".el-drawer").text()).toContain("今晚 22:00 进行系统维护。");
    expect(wrapper.get(".el-drawer").text()).toContain("陈管理员");
    wrapper.unmount();
  });
});
