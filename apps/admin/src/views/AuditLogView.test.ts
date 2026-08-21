import { AdminRole, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditLogView from "./AuditLogView.vue";
import type { AuditLog } from "@/types/admin";

const { listAuditLogs } = vi.hoisted(() => ({
  listAuditLogs: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: { listAuditLogs },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "admin-1", name: "陈管理员", email: "admin@example.com", role: AdminRole.ADMIN },
  }),
}));

function audit(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: "audit-1",
    createdAt: "2026-08-14T00:00:00.000Z",
    actorName: "admin@example.com",
    actorRole: AdminRole.ADMIN,
    action: "DRAMA_PUBLISHED",
    target: "Drama:drama-1",
    result: "SUCCESS",
    requestId: "request-1",
    detail: "发布剧目",
    ...overrides,
  };
}

describe("AuditLogView", () => {
  beforeEach(() => listAuditLogs.mockReset());

  it("renders a useful empty state when the API returns no logs", async () => {
    listAuditLogs.mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(AuditLogView);

    await flushPromises();

    expect(wrapper.text()).toContain("没有匹配的审计记录");
    expect(wrapper.text()).toContain("尝试清空关键词后重新搜索");
    expect(wrapper.get("input[type='search']").attributes("maxlength")).toBe(String(LIST_QUERY_MAX_LENGTH));
  });

  it("pages through the server list and resets to page 1 when searching", async () => {
    listAuditLogs.mockResolvedValue({ items: [audit()], total: 51 });
    const wrapper = mount(AuditLogView);
    await flushPromises();

    expect(listAuditLogs).toHaveBeenCalledWith("", 1);
    expect(wrapper.text()).toContain("第 1 页");
    expect(wrapper.text()).toContain("共 51 条记录");

    await wrapper.findAll("button").find((button) => button.text() === "下一页")?.trigger("click");
    await flushPromises();
    expect(listAuditLogs).toHaveBeenLastCalledWith("", 2);

    await wrapper.get("input[type='search']").setValue("request-9");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(listAuditLogs).toHaveBeenLastCalledWith("request-9", 1);
  });

  it("renders structured resource context and keeps old records readable", async () => {
    listAuditLogs.mockResolvedValue({
      items: [
        audit({
          action: "MEDIA_REVIEWED",
          context: {
            dramaId: "drama-1",
            episodeNumber: 7,
            mediaVersion: 3,
            uploadPhase: "MEDIA_REGISTERED",
            fromStatus: "PENDING",
            toStatus: "APPROVED",
            reviewStatus: "APPROVED"
          }
        }),
        audit({ id: "audit-2", detail: "旧记录" })
      ],
      total: 2
    });
    const wrapper = mount(AuditLogView);

    await flushPromises();

    expect(wrapper.text()).toContain("剧目 drama-1");
    expect(wrapper.text()).toContain("第 7 集");
    expect(wrapper.text()).toContain("媒体 v3");
    expect(wrapper.text()).toContain("状态 PENDING → APPROVED");
    expect(wrapper.text()).toContain("结论 APPROVED");
    expect(wrapper.text()).toContain("旧记录");
  });
});
