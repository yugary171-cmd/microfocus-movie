import { AdminRole, DramaStatus, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DramaDetailDrawer from "@/components/DramaDetailDrawer.vue";
import DramaListView from "./DramaListView.vue";
import type { DramaRecord } from "@/types/admin";

const { getDrama, listDramas } = vi.hoisted(() => ({
  getDrama: vi.fn(),
  listDramas: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: { getDrama, listDramas },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "editor-1", name: "林编辑", email: "editor@example.com", role: AdminRole.EDITOR },
  }),
}));

function drama(overrides: Partial<DramaRecord> = {}): DramaRecord {
  return {
    id: "drama-1",
    title: "微焦短剧",
    summary: "简介",
    category: "都市",
    tags: [],
    tagIds: [],
    coverUrl: "",
    promoCoverUrl: "",
    status: DramaStatus.DRAFT,
    ownerId: "editor-1",
    ownerName: "林编辑",
    rightsHolder: "",
    licenseNumber: "",
    rightsValidFrom: "",
    licenseExpiresAt: "",
    rightsReportNumber: "",
    rightsMaterialObjectKey: "",
    rightsMaterialDigestSha256: "",
    allowsWechatDistribution: false,
    allowsAdMonetization: false,
    allowsTranscoding: false,
    allowsPromotionalMaterial: false,
    contentApproved: false,
    copyrightVerified: false,
    wechatApproved: false,
    episodes: [],
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("DramaListView", () => {
  beforeEach(() => {
    getDrama.mockReset();
    listDramas.mockReset();
  });

  it("renders a useful empty state when the API returns no dramas", async () => {
    listDramas.mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(DramaListView);

    await flushPromises();

    expect(wrapper.text()).toContain("没有匹配的剧目");
    expect(wrapper.text()).toContain("创建第一部剧目");
    expect(wrapper.get("input[type='search']").attributes("maxlength")).toBe(String(LIST_QUERY_MAX_LENGTH));
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

  it("pages through the server list and resets to page 1 when filtering", async () => {
    listDramas.mockResolvedValue({ items: [drama()], total: 51 });
    const wrapper = mount(DramaListView);
    await flushPromises();

    expect(listDramas).toHaveBeenCalledWith("", "", 1);
    expect(wrapper.text()).toContain("第 1 页");
    expect(wrapper.text()).toContain("共 51 部剧目");

    await wrapper.findAll("button").find((button) => button.text() === "下一页")?.trigger("click");
    await flushPromises();
    expect(listDramas).toHaveBeenLastCalledWith("", "", 2);

    await wrapper.get("input[type='search']").setValue("微焦");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(listDramas).toHaveBeenLastCalledWith("微焦", "", 1);
    wrapper.unmount();
  });

  it("opens read-only details while keeping edit on the existing route", async () => {
    const detail = drama({ title: "完整剧目", tags: ["都市"] });
    listDramas.mockResolvedValue({ items: [drama()], total: 1 });
    getDrama.mockResolvedValue(detail);
    const wrapper = mount(DramaListView);

    await flushPromises();

    expect(wrapper.text()).toContain("查看");
    expect(wrapper.text()).toContain("编辑");
    expect(wrapper.html()).toContain("/dramas/drama-1");

    await wrapper.get("button.link").trigger("click");
    await flushPromises();

    expect(getDrama).toHaveBeenCalledWith("drama-1");
    expect(wrapper.findComponent(DramaDetailDrawer).props("open")).toBe(true);
    expect(wrapper.text()).toContain("完整剧目");
    expect(wrapper.text()).toContain("版权与许可");

    wrapper.findComponent(DramaDetailDrawer).vm.$emit("close");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(DramaDetailDrawer).props("open")).toBe(false);
    wrapper.unmount();
  });

  it("shows a retryable error when loading drama details fails", async () => {
    listDramas.mockResolvedValue({ items: [drama()], total: 1 });
    getDrama.mockRejectedValueOnce(new Error("详情接口暂时不可用"));
    const wrapper = mount(DramaListView);

    await flushPromises();
    await wrapper.get("button.link").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("详情接口暂时不可用");
    const retry = wrapper.findAll("button").find((button) => button.text() === "重新加载");
    expect(retry).toBeTruthy();

    getDrama.mockResolvedValueOnce(drama({ title: "重试成功" }));
    await retry?.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("重试成功");
    expect(getDrama).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
