import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DramaListView from "./DramaListView.vue";

const { listDramas } = vi.hoisted(() => ({
  listDramas: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: { listDramas },
}));

describe("DramaListView", () => {
  beforeEach(() => listDramas.mockReset());

  it("renders a useful empty state when the API returns no dramas", async () => {
    listDramas.mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(DramaListView);

    await flushPromises();

    expect(wrapper.text()).toContain("没有匹配的剧目");
    expect(wrapper.text()).toContain("创建第一部剧目");
  });

  it("renders a retryable error state when the API fails", async () => {
    listDramas.mockImplementationOnce(async () => {
      throw new Error("API 暂时不可用");
    });
    const wrapper = mount(DramaListView);

    await flushPromises();

    expect(wrapper.text()).toContain("API 暂时不可用");
    expect(wrapper.get("button.button--secondary").text()).toMatch(/重新加载|筛选/);
    expect(wrapper.findAll("button").some((button) => button.text() === "重新加载")).toBe(true);
    wrapper.unmount();
  });
});
