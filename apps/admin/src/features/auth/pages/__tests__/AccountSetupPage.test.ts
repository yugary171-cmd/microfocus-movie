import { AdminRole } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountSetupPage from "@/features/auth/pages/AccountSetupPage.vue";

const { inspectAccountSetup, completeAccountSetup, replace, toDataURL } = vi.hoisted(() => ({
  inspectAccountSetup: vi.fn(),
  completeAccountSetup: vi.fn(),
  replace: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("@/features/auth/api", () => ({
  authApi: { inspectAccountSetup, completeAccountSetup },
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace }),
}));
vi.mock("qrcode", () => ({ toDataURL }));

describe("AccountSetupPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/account-setup#token=one-time-token");
    inspectAccountSetup.mockReset();
    completeAccountSetup.mockReset();
    replace.mockReset();
    toDataURL.mockReset().mockResolvedValue("data:image/png;base64,mock");
  });

  it("renders a generic invalid-link state without confirming an account", async () => {
    inspectAccountSetup.mockRejectedValue(new Error("expired"));
    const wrapper = mount(AccountSetupPage);
    await flushPromises();

    expect(wrapper.text()).toContain("这个链接已无法使用");
    expect(wrapper.text()).toContain("不会确认账号是否存在");
    expect(wrapper.text()).not.toContain("expired");
  });

  it("does not inspect a token supplied in the query string", async () => {
    window.history.replaceState({}, "", "/account-setup?token=query-token");
    const wrapper = mount(AccountSetupPage);
    await flushPromises();

    expect(inspectAccountSetup).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("这个链接已无法使用");
  });

  it("renders the QR code and completes setup with password and current TOTP", async () => {
    inspectAccountSetup.mockResolvedValue({
      displayName: "王审核",
      email: "reviewer@example.com",
      role: AdminRole.REVIEWER,
      purpose: "INVITE",
      otpauthUri: "otpauth://totp/mock",
      manualKey: "MOCKKEY",
      expiresAt: "2026-08-19T12:00:00.000Z",
    });
    completeAccountSetup.mockResolvedValue(undefined);
    const wrapper = mount(AccountSetupPage);
    await flushPromises();

    expect(toDataURL).toHaveBeenCalledWith("otpauth://totp/mock", expect.any(Object));
    expect(wrapper.text()).toContain("王审核");
    expect(wrapper.get("img").attributes("src")).toContain("data:image/png");

    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("strong-password-2026");
    await inputs[1]!.setValue("strong-password-2026");
    await inputs[2]!.setValue("123456");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(completeAccountSetup).toHaveBeenCalledWith(
      "one-time-token",
      "strong-password-2026",
      "123456",
    );
    expect(wrapper.text()).toContain("账号已完成开通");
  });

  it("rejects mismatched passwords before calling complete", async () => {
    inspectAccountSetup.mockResolvedValue({
      displayName: "王审核",
      email: "reviewer@example.com",
      role: AdminRole.REVIEWER,
      purpose: "INVITE",
      otpauthUri: "otpauth://totp/mock",
      manualKey: "MOCKKEY",
      expiresAt: "2026-08-19T12:00:00.000Z",
    });
    const wrapper = mount(AccountSetupPage);
    await flushPromises();
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("strong-password-2026");
    await inputs[1]!.setValue("different-password-2026");
    await inputs[2]!.setValue("123456");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(completeAccountSetup).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("两次输入的密码不一致");
  });

  it("toggles new and confirm password visibility independently", async () => {
    inspectAccountSetup.mockResolvedValue({
      displayName: "王审核",
      email: "reviewer@example.com",
      role: AdminRole.REVIEWER,
      purpose: "INVITE",
      otpauthUri: "otpauth://totp/mock",
      manualKey: "MOCKKEY",
      expiresAt: "2026-08-19T12:00:00.000Z",
    });
    const wrapper = mount(AccountSetupPage);
    await flushPromises();
    const fields = wrapper.findAll(".password-field");
    expect(fields).toHaveLength(2);
    expect(fields[0]!.get("input").attributes("type")).toBe("password");
    await fields[0]!.get('button[aria-label="显示密码"]').trigger("click");
    expect(fields[0]!.get("input").attributes("type")).toBe("text");
    expect(fields[1]!.get("input").attributes("type")).toBe("password");
    wrapper.unmount();
  });
});
