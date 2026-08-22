import { h } from "vue";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AdminTable, { type AdminTableColumn } from "@/shared/components/AdminTable.vue";

const tableStubs = {
  ElTable: {
    props: ["data", "class", "tableLayout", "fit", "width"],
    template: '<div class="table-stub"><slot /></div>',
  },
  ElTableColumn: {
    props: ["label", "prop", "fixed", "width", "minWidth"],
    template: '<div class="column-stub" :data-label="label" :data-fixed="fixed" :data-width="width" :data-min-width="minWidth"><slot name="default" :row="{ id: \'row-1\', title: \'测试通知\' }" /></div>',
  },
};

describe("AdminTable", () => {
  it("renders configured columns and appends a fixed operation column", () => {
    const columns: AdminTableColumn[] = [
      { key: "title", prop: "title", label: "通知标题", minWidth: 180 },
      { key: "status", prop: "status", label: "状态", minWidth: 100 },
    ];
    const wrapper = mount(AdminTable, {
      props: { rows: [{ id: "row-1", title: "测试通知", status: "草稿" }], columns },
      slots: {
        actions: ({ row }: { row: Record<string, unknown> }) =>
          h("button", { type: "button" }, `查看 ${row.id}`),
      },
      global: { stubs: tableStubs },
    });

    const columnsInDom = wrapper.findAll(".column-stub");
    expect(wrapper.find(".admin-table-wrap").exists()).toBe(true);
    expect(columnsInDom).toHaveLength(3);
    expect(columnsInDom[0]!.attributes("data-label")).toBe("通知标题");
    expect(columnsInDom[1]!.attributes("data-label")).toBe("状态");
    expect(columnsInDom[2]!.attributes("data-label")).toBe("操作");
    expect(columnsInDom[2]!.attributes("data-fixed")).toBe("right");
    expect(columnsInDom[2]!.attributes("data-width")).toBe("230");
    expect(wrapper.find(".admin-table__actions").exists()).toBe(true);
    expect(wrapper.text()).toContain("查看 row-1");
  });
});
