import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TagPickerDialog from "./TagPickerDialog.vue";

describe("TagPickerDialog", () => {
  it("reads enabled library words and blocks leftover custom tags", async () => {
    const wrapper = mount(TagPickerDialog, {
      attachTo: document.body,
      props: {
        open: true,
        selected: ["ctag_042", "draft"],
        groups: [{ id: "backgrounds", label: "时代背景", options: [{ id: "ctag_042", name: "都市" }] }],
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("都市");
    expect(wrapper.text()).toContain("已选其他");
    expect(wrapper.text()).toContain("未知标签");
    const confirm = wrapper.findAll("button").find((button) => button.text() === "完成");
    expect(confirm?.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});
