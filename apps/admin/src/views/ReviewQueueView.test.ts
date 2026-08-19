import { AdminRole, REVIEW_NOTES_MAX_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReviewQueueView from "./ReviewQueueView.vue";

const { listReviews, authUser } = vi.hoisted(() => ({
  listReviews: vi.fn(),
  authUser: {
    id: "editor-1",
    name: "林编辑",
    email: "editor@example.com",
    role: "EDITOR" as AdminRole,
  },
}));

vi.mock("@/api/admin", () => ({
  adminApi: { listReviews, mode: "mock" },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: authUser,
  }),
}));

describe("ReviewQueueView", () => {
  beforeEach(() => {
    listReviews.mockReset();
    authUser.id = "editor-1";
    authUser.role = AdminRole.EDITOR;
  });

  it("requests paged reviews and can move to the next page", async () => {
    listReviews.mockResolvedValue({
      items: [
        {
          id: "review-1",
          dramaId: "drama-1",
          dramaTitle: "待审剧目",
          submitterId: "editor-1",
          submitterName: "林编辑",
          submittedAt: "2026-08-14T00:00:00.000Z",
          riskFlags: [],
          status: "PENDING",
        },
      ],
      total: 51,
    });
    const wrapper = mount(ReviewQueueView);
    await flushPromises();

    expect(listReviews).toHaveBeenCalledWith(1);
    expect(wrapper.find("input[type='search']").exists()).toBe(false);
    expect(wrapper.text()).toContain("第 1 页");
    expect(wrapper.text()).toContain("共 51 条待审");

    await wrapper.findAll("button").find((button) => button.text() === "下一页")?.trigger("click");
    await flushPromises();
    expect(listReviews).toHaveBeenLastCalledWith(2);
  });

  it("lets an editor approve their own pending submission", async () => {
    listReviews.mockResolvedValue({
      items: [
        {
          id: "review-own",
          dramaId: "drama-1",
          dramaTitle: "自己提交的剧",
          submitterId: "editor-1",
          submitterName: "林编辑",
          submittedAt: "2026-08-14T00:00:00.000Z",
          riskFlags: [],
          status: "PENDING",
        },
      ],
      total: 1,
    });
    const wrapper = mount(ReviewQueueView);
    await flushPromises();
    expect(wrapper.text()).not.toContain("当前角色不能访问审核队列");
    expect(wrapper.findAll("button").some((button) => button.text() === "审核通过")).toBe(true);
    wrapper.unmount();
  });

  it("caps reject notes to the content-review contract limit", async () => {
    listReviews.mockResolvedValue({
      items: [
        {
          id: "review-1",
          dramaId: "drama-1",
          dramaTitle: "待审剧目",
          submitterId: "editor-1",
          submitterName: "林编辑",
          submittedAt: "2026-08-14T00:00:00.000Z",
          riskFlags: [],
          status: "PENDING",
        },
      ],
      total: 1,
    });
    const wrapper = mount(ReviewQueueView, {
      global: { stubs: { Teleport: true } },
    });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "拒绝并退回")?.trigger("click");
    expect(wrapper.get("textarea").attributes("maxlength")).toBe(String(REVIEW_NOTES_MAX_LENGTH));
    wrapper.unmount();
  });

  it("falls back to the last populated page when the current page is empty", async () => {
    const pending = {
      id: "review-1",
      dramaId: "drama-1",
      dramaTitle: "待审剧目",
      submitterId: "editor-1",
      submitterName: "林编辑",
      submittedAt: "2026-08-14T00:00:00.000Z",
      riskFlags: [],
      status: "PENDING" as const,
    };
    listReviews
      .mockResolvedValueOnce({ items: [pending], total: 51 })
      .mockResolvedValueOnce({ items: [], total: 50 })
      .mockResolvedValueOnce({ items: [pending], total: 50 });
    const wrapper = mount(ReviewQueueView);
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "下一页")?.trigger("click");
    await flushPromises();

    expect(listReviews.mock.calls.map((call) => call[0])).toEqual([1, 2, 1]);
    expect(wrapper.text()).toContain("待审剧目");
    wrapper.unmount();
  });
});
