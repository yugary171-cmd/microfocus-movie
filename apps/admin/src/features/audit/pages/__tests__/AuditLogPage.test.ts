import { ADMIN_WEB_PAGE_SIZE, AdminRole, LIST_QUERY_MAX_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditLogPage from "@/features/audit/pages/AuditLogPage.vue";
import type { AuditLog } from "@/shared/types";

const { listAuditLogs } = vi.hoisted(() => ({
  listAuditLogs: vi.fn(),
}));

vi.mock("@/features/audit/api", () => ({
  auditApi: { listAuditLogs },
}));

vi.mock("@/infrastructure/stores", () => ({
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

describe("AuditLogPage", () => {
  beforeEach(() => listAuditLogs.mockReset());

  it("renders a useful empty state when the API returns no logs", async () => {
    listAuditLogs.mockResolvedValue({ items: [], total: 0 });
    const wrapper = mount(AuditLogPage);

    await flushPromises();

    expect(wrapper.text()).toContain("没有匹配的审计记录");
    expect(wrapper.text()).toContain("尝试清空关键词后重新搜索");
    expect(wrapper.get("input[type='search']").attributes("maxlength")).toBe(String(LIST_QUERY_MAX_LENGTH));
  });

  it("pages through the server list and resets to page 1 when searching", async () => {
    listAuditLogs.mockResolvedValue({ items: [audit()], total: 51 });
    const wrapper = mount(AuditLogPage);
    await flushPromises();

    expect(listAuditLogs).toHaveBeenCalledWith("", 1, ADMIN_WEB_PAGE_SIZE);
    expect(wrapper.text()).toContain("每页显示：");
    expect(wrapper.find('[data-testid="admin-pagination"]').exists()).toBe(true);

    await wrapper.get('[data-testid="admin-pagination"] .btn-next').trigger("click");
    await flushPromises();
    expect(listAuditLogs).toHaveBeenLastCalledWith("", 2, ADMIN_WEB_PAGE_SIZE);

    await wrapper.get("input[type='search']").setValue("request-9");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(listAuditLogs).toHaveBeenLastCalledWith("request-9", 1, ADMIN_WEB_PAGE_SIZE);
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
    const wrapper = mount(AuditLogPage);

    await flushPromises();

    expect(wrapper.text()).toContain("剧目 drama-1");
    expect(wrapper.text()).toContain("第 7 集");
    expect(wrapper.text()).toContain("媒体 v3");
    expect(wrapper.text()).toContain("状态 PENDING → APPROVED");
    expect(wrapper.text()).toContain("结论 APPROVED");
    expect(wrapper.text()).toContain("旧记录");
  });
});
