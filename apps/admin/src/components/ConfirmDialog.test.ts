import { ADMIN_REASON_MAX_LENGTH, ADMIN_REASON_MIN_LENGTH } from "@microfocus/contracts";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConfirmDialog from "./ConfirmDialog.vue";

describe("ConfirmDialog", () => {
  it("keeps confirm disabled until the admin reason is within bounds", async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        open: true,
        title: "确认下架",
        message: "请说明原因。",
        requireReason: true,
      },
      global: {
        stubs: {
          Teleport: { template: "<div><slot /></div>" },
        },
      },
    });
    expect(wrapper.get("textarea").attributes("minlength")).toBe(String(ADMIN_REASON_MIN_LENGTH));
    expect(wrapper.get("textarea").attributes("maxlength")).toBe(String(ADMIN_REASON_MAX_LENGTH));

    await wrapper.get("textarea").setValue("短");
    await wrapper.findAll("button").find((button) => button.text() === "确认")?.trigger("click");
    expect(wrapper.emitted("confirm")).toBeUndefined();

    await wrapper.get("textarea").setValue("事故下架说明");
    await wrapper.findAll("button").find((button) => button.text() === "确认")?.trigger("click");
    expect(wrapper.emitted("confirm")?.[0]).toEqual(["事故下架说明"]);
    wrapper.unmount();
  });
});
