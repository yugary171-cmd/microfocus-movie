import { AdminRole, DramaStatus } from "@microfocus/contracts";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DramaActions from "./DramaActions.vue";
import { createDrama, createGate, createUser } from "@/test/fixtures";

describe("DramaActions", () => {
  it.each([AdminRole.EDITOR, AdminRole.REVIEWER, AdminRole.ADMIN])(
    "shows submit, publish, and offline to content operator %s",
    (role) => {
      const wrapper = mount(DramaActions, {
        props: {
          user: createUser(role),
          drama: createDrama({ status: DramaStatus.DRAFT, ownerId: `${role.toLowerCase()}-1` }),
          gate: createGate(),
        },
      });

      expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
        "提交审核",
        "发布剧目",
        "下架剧目",
      ]);
    },
  );

  it("renders a disabled publish button and moves the gate reason into a hover tooltip", () => {
    const wrapper = mount(DramaActions, {
      props: {
        user: createUser(AdminRole.ADMIN),
        drama: createDrama(),
        gate: createGate({ readyForExternalTraffic: false, blockers: ["资质待审批"] }),
      },
    });

    const publish = wrapper.findAll("button").find((button) => button.text() === "发布剧目");
    expect(publish?.attributes("disabled")).toBeDefined();
    expect(wrapper.findAll(".action-button-tooltip-target")).toHaveLength(3);
    expect(wrapper.findAll(".action-help-trigger")).toHaveLength(0);
    expect(wrapper.findAll(".action-with-help small")).toHaveLength(0);
  });

  it("lets administrators publish a ready drama and keeps offline disabled", () => {
    const wrapper = mount(DramaActions, {
      props: {
        user: createUser(AdminRole.ADMIN),
        drama: createDrama(),
        gate: createGate(),
      },
    });

    const publish = wrapper.findAll("button").find((button) => button.text() === "发布剧目");
    const offline = wrapper.findAll("button").find((button) => button.text() === "下架剧目");
    expect(publish?.attributes("disabled")).toBeUndefined();
    expect(offline?.attributes("disabled")).toBeDefined();
  });
});
