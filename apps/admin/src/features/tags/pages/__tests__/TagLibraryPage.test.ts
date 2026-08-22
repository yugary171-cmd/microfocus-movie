import { AdminRole, CatalogTagStatus } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import TagLibraryPage from "@/features/tags/pages/TagLibraryPage.vue";

const { listCatalogTags, getCatalogTag } = vi.hoisted(() => ({
  listCatalogTags: vi.fn(),
  getCatalogTag: vi.fn(),
}));

vi.mock("@/features/tags/api", () => ({
  tagsApi: {
    listCatalogTags,
    createCatalogTag: vi.fn(),
    patchCatalogTag: vi.fn(),
    getCatalogTag,
    deleteCatalogTag: vi.fn(),
  },
}));

vi.mock("@/infrastructure/stores", () => ({
  useAuthStore: () => ({
    user: {
      id: "admin-1",
      name: "陈管理员",
      email: "admin@example.com",
      role: AdminRole.ADMIN,
    },
  }),
}));

describe("TagLibraryPage", () => {
  it("lists groups as chips and re-enables an archived word from the chip", async () => {
    listCatalogTags.mockResolvedValue({
      items: [
        { id: "1", group: "subjects", name: "都市", status: CatalogTagStatus.ACTIVE, sortOrder: 0 },
        { id: "2", group: "audiences", name: "男频", status: CatalogTagStatus.ARCHIVED, sortOrder: 1 },
      ],
    });
    const wrapper = mount(TagLibraryPage, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain("维护启用词");
    expect(wrapper.text()).toContain("1 启用");
    expect(wrapper.text()).toContain("1 停用");
    expect(wrapper.findAll('button[aria-label^="处理"]')).toHaveLength(2);
    const urban = wrapper.findAll("button").find((chip) => chip.text() === "都市");
    const audience = wrapper.findAll("button").find((chip) => chip.text() === "男频");
    expect(urban?.attributes("aria-pressed")).toBe("true");
    expect(audience?.attributes("aria-pressed")).toBe("false");
    await audience?.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("启用标签");
    wrapper.unmount();
  });

  it("checks tag usage on the corner control and offers replace or archive when in use", async () => {
    listCatalogTags.mockResolvedValue({
      items: [{ id: "1", group: "subjects", name: "都市", status: CatalogTagStatus.ACTIVE, sortOrder: 0 }],
    });
    getCatalogTag.mockResolvedValue({
      id: "1",
      group: "subjects",
      name: "都市",
      status: CatalogTagStatus.ACTIVE,
      sortOrder: 0,
      usageCount: 2,
    });
    const wrapper = mount(TagLibraryPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button[aria-label^="处理"]').trigger("click");
    await flushPromises();
    expect(getCatalogTag).toHaveBeenCalledWith("1");
    expect(document.body.textContent).toContain("标签使用中");
    expect(document.body.textContent).toContain("替换后删除");
    expect(document.body.textContent).toContain("停用");
    wrapper.unmount();
  });
});
