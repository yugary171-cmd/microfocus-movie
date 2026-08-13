import { AdminRole, DramaStatus } from "@microfocus/contracts";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DramaActions from "./DramaActions.vue";
import { createDrama, createGate, createUser } from "@/test/fixtures";

describe("DramaActions", () => {
  it.each([
    [AdminRole.EDITOR, "提交审核", "发布剧目", "下架剧目"],
    [AdminRole.REVIEWER, "", "提交审核", "发布剧目"],
  ])("shows only the action owned by %s", (role, visible, hiddenA, hiddenB) => {
    const drama = role === AdminRole.EDITOR
      ? createDrama({ status: DramaStatus.DRAFT })
      : createDrama();
    const wrapper = mount(DramaActions, {
      props: { user: createUser(role), drama, gate: createGate() },
    });

    if (visible) expect(wrapper.get("button").text()).toBe(visible);
    else expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.text()).not.toContain(hiddenA);
    expect(wrapper.text()).not.toContain(hiddenB);
  });

  it("renders a disabled publish button and the gate reason", () => {
    const wrapper = mount(DramaActions, {
      props: {
        user: createUser(AdminRole.ADMIN),
        drama: createDrama(),
        gate: createGate({ readyForExternalTraffic: false, blockers: ["资质待审批"] }),
      },
    });

    const button = wrapper.get("button");
    expect(button.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("合规发布闸门尚未通过");
  });

  it("shows publish and offline controls only to administrators", () => {
    const wrapper = mount(DramaActions, {
      props: {
        user: createUser(AdminRole.ADMIN),
        drama: createDrama(),
        gate: createGate(),
      },
    });

    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "发布剧目",
      "下架剧目",
    ]);
    expect(wrapper.get("button.button--primary").attributes("disabled")).toBeUndefined();
    expect(wrapper.get("button.button--danger").attributes("disabled")).toBeDefined();
  });
});
