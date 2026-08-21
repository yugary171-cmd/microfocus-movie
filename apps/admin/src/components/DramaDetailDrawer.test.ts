import { h, defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DramaDetailDrawer from "./DramaDetailDrawer.vue";
import { createDrama } from "@/test/fixtures";

const drawerStub = defineComponent({
  name: "ElDrawer",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "close"],
  template: `
    <div v-if="modelValue" class="el-drawer-stub">
      <header><slot name="header" /></header>
      <main><slot /></main>
      <footer><slot name="footer" /></footer>
    </div>
  `,
});

const routerLinkStub = defineComponent({
  name: "RouterLink",
  props: {
    to: { type: [String, Object], default: "" },
  },
  setup(props, { slots }) {
    return () => h("a", { href: String(props.to) }, slots.default?.());
  },
});

function mountDrawer(drama = createDrama()) {
  return mount(DramaDetailDrawer, {
    props: { open: true, drama },
    global: {
      stubs: {
        ElDrawer: drawerStub,
        "el-drawer": drawerStub,
        RouterLink: routerLinkStub,
      },
    },
  });
}

describe("DramaDetailDrawer", () => {
  it("renders all detail sections without exposing editable controls or material secrets", () => {
    const wrapper = mountDrawer();

    expect(wrapper.text()).toContain("剧目详情");
    expect(wrapper.text()).toContain("基础信息");
    expect(wrapper.text()).toContain("版权与许可");
    expect(wrapper.text()).toContain("剧集与媒体");
    expect(wrapper.text()).toContain("发布状态");
    expect(wrapper.text()).toContain("编辑剧目");
    expect(wrapper.text()).toContain("关闭");
    expect(wrapper.find(".drama-detail-header").text()).toBe("剧目详情");
    expect(wrapper.find(".drama-detail-header__meta").exists()).toBe(false);
    expect(wrapper.find(".drama-detail-header a").exists()).toBe(false);
    expect(wrapper.find(".drama-detail-footer a").exists()).toBe(true);
    expect(wrapper.find(".drama-detail-footer button").text()).toBe("关闭");
    expect(wrapper.text()).toContain("已提交（原始信息隐藏）");
    expect(wrapper.text()).not.toContain("rights/test/license.pdf");
    expect(wrapper.findAll("input, textarea, select")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("选择视频");
  });

  it("shows safe empty states when optional drama data is missing", () => {
    const wrapper = mountDrawer(
      createDrama({
        category: "",
        tags: [],
        coverUrl: "",
        rightsHolder: "",
        licenseNumber: "",
        rightsMaterialObjectKey: "",
        rightsMaterialDigestSha256: "",
        episodes: [],
      }),
    );

    expect(wrapper.text()).toContain("暂无海报");
    expect(wrapper.text()).toContain("暂无标签");
    expect(wrapper.text()).toContain("尚未添加剧集");
    expect(wrapper.text()).toContain("待补齐");
    expect(wrapper.text()).toContain("未提交");
  });

  it("forwards the drawer close event", () => {
    const wrapper = mountDrawer();
    wrapper.findComponent(drawerStub).vm.$emit("update:modelValue", false);

    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
