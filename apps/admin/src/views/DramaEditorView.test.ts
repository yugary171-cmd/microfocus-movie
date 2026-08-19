import { AdminRole, DramaStatus, DRAMA_SUMMARY_MAX_LENGTH, DRAMA_TAG_MAX_COUNT, DRAMA_TITLE_MAX_LENGTH, RIGHTS_MATERIAL_DIGEST_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DramaEditorView from "./DramaEditorView.vue";
import { createDrama } from "@/test/fixtures";

const { saveDrama, releaseGate, authUser } = vi.hoisted(() => ({
  saveDrama: vi.fn(),
  releaseGate: vi.fn(),
  authUser: {
    id: "editor-1",
    name: "林编辑",
    email: "editor@example.com",
    role: "EDITOR" as AdminRole,
  },
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    mode: "mock",
    saveDrama,
    releaseGate,
    getDrama: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: authUser,
  }),
}));

describe("DramaEditorView", () => {
  beforeEach(() => {
    saveDrama.mockReset();
    authUser.id = "editor-1";
    authUser.role = AdminRole.EDITOR;
    releaseGate.mockResolvedValue({
      entityApproved: true,
      miniProgramFilingApproved: true,
      wechatCategoryApproved: true,
      adsApproved: true,
      readyForExternalTraffic: true,
      blockers: [],
    });
  });

  it("uses contract field limits and blocks save when the draft is oversized", async () => {
    const wrapper = mount(DramaEditorView);
    await flushPromises();

    expect(wrapper.get("input").attributes("maxlength")).toBe(String(DRAMA_TITLE_MAX_LENGTH));
    expect(wrapper.get("textarea").attributes("maxlength")).toBe(String(DRAMA_SUMMARY_MAX_LENGTH));
    expect(wrapper.get("input[placeholder='64 位十六进制摘要']").attributes("maxlength")).toBe(
      String(RIGHTS_MATERIAL_DIGEST_LENGTH),
    );
    expect(wrapper.text()).toContain(`最多 ${DRAMA_TAG_MAX_COUNT} 个`);

    await wrapper.get("input[placeholder='使用逗号分隔']").setValue(
      Array.from({ length: DRAMA_TAG_MAX_COUNT + 1 }, (_, index) => `标签${index}`).join("，"),
    );
    await wrapper.findAll("button").find((button) => button.text() === "保存草稿")?.trigger("click");
    await flushPromises();

    expect(saveDrama).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("标签最多");
    wrapper.unmount();
  });

  it("lets a system administrator fill and save a new drama", async () => {
    authUser.id = "admin-1";
    authUser.role = AdminRole.ADMIN;
    saveDrama.mockResolvedValue(
      createDrama({
        id: "drama-admin-new",
        title: "管理员新建剧",
        ownerId: "admin-1",
        ownerName: "陈管理员",
        status: DramaStatus.DRAFT,
        episodes: [],
      }),
    );
    const wrapper = mount(DramaEditorView);
    await flushPromises();

    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();
    expect(wrapper.text()).toContain("保存草稿");
    expect(wrapper.text()).not.toContain("只能编辑本人负责的剧目");

    await wrapper.get("input").setValue("管理员新建剧");
    const save = wrapper.findAll("button").find((button) => button.text() === "保存草稿");
    expect(save?.attributes("disabled")).toBeUndefined();
    await save?.trigger("click");
    await flushPromises();
    expect(saveDrama).toHaveBeenCalled();
    wrapper.unmount();
  });
});
