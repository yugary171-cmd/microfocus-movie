import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AdminSearchInput from "./AdminSearchInput.vue";

describe("AdminSearchInput", () => {
  it("applies width and style attributes to the control shell", () => {
    const wrapper = mount(AdminSearchInput, {
      props: { modelValue: "", width: 320 },
      attrs: { style: "max-width: 480px" },
    });

    expect(wrapper.get(".admin-search-input").attributes("style")).toContain("width: 320px");
    expect(wrapper.get(".admin-search-input").attributes("style")).toContain("max-width: 480px");

    wrapper.unmount();
  });

  it("emits model updates and submit from the icon or Enter", async () => {
    const wrapper = mount(AdminSearchInput, {
      props: { modelValue: "" },
    });
    const input = wrapper.get("input");

    await input.setValue("内部");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["内部"]);

    await wrapper.get('button[aria-label="搜索"]').trigger("click");
    await input.trigger("keyup.enter");
    expect(wrapper.emitted("submit")).toHaveLength(2);

    wrapper.unmount();
  });
});
