import { AdminRole, COMPENSATION_SECONDS_MIN, ENTITY_ID_MAX_LENGTH, REWARD_SECONDS } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationsView from "./OperationsView.vue";

const { getCircuitBreaker, listCallbackEvents } = vi.hoisted(() => ({
  getCircuitBreaker: vi.fn(),
  listCallbackEvents: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    mode: "mock",
    getCircuitBreaker,
    listCallbackEvents,
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "admin-1", name: "陈管理员", email: "admin@example.com", role: AdminRole.ADMIN },
  }),
}));

describe("OperationsView", () => {
  beforeEach(() => {
    getCircuitBreaker.mockReset();
    listCallbackEvents.mockReset();
    getCircuitBreaker.mockResolvedValue({
      enabled: false,
      reason: "",
      updatedAt: null,
      updatedBy: null,
    });
    listCallbackEvents.mockResolvedValue({ items: [], total: 0 });
  });

  it("uses contract entity-id limits on compensation, replay, and reissue fields", async () => {
    const wrapper = mount(OperationsView);
    await flushPromises();

    const compensationSeconds = wrapper
      .findAll("input[type='number']")
      .find((input) => input.attributes("min") === String(COMPENSATION_SECONDS_MIN));
    expect(Number((compensationSeconds?.element as HTMLInputElement).value)).toBe(REWARD_SECONDS);

    const adjustmentSeconds = wrapper
      .findAll("input[type='number']")
      .find((input) => input.attributes("min") === "1");
    expect(Number((adjustmentSeconds?.element as HTMLInputElement).value)).toBe(COMPENSATION_SECONDS_MIN);

    const bounded = wrapper
      .findAll("input")
      .filter((input) => input.attributes("maxlength") === String(ENTITY_ID_MAX_LENGTH));
    expect(bounded.map((input) => input.attributes("placeholder"))).toEqual([
      "用户内部 ID",
      "drama-…",
      "grant-…",
      "provider 事件 ID",
      "deletion-request-…",
      "必须与申请所属用户一致",
    ]);

    await wrapper.get("input[placeholder='用户内部 ID']").setValue("x".repeat(ENTITY_ID_MAX_LENGTH + 1));
    await wrapper.get("input[placeholder='drama-…']").setValue("drama-1");
    await wrapper.get("textarea[placeholder='说明事故、工单或用户影响']").setValue("事故补偿说明");
    await wrapper.findAll("form").at(0)?.trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain(`用户 ID最长 ${ENTITY_ID_MAX_LENGTH}`);
    wrapper.unmount();
  });
});
