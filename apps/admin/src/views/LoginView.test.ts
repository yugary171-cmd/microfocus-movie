import { EMAIL_MAX_LENGTH, OTP_INPUT_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@microfocus/contracts";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginView from "./LoginView.vue";

const login = vi.hoisted(() => vi.fn());

vi.mock("@/api/admin", () => ({
  adminApi: { mode: "mock" },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ login }),
}));

describe("LoginView", () => {
  beforeEach(() => {
    login.mockReset();
    login.mockResolvedValue(undefined);
  });

  it("uses contract email and password limits and blocks oversized login", async () => {
    const wrapper = mount(LoginView);
    const email = wrapper.get("input[type='email']");
    const password = wrapper.get("input[type='password']");
    const otp = wrapper.get("input[autocomplete='one-time-code']");

    expect(email.attributes("maxlength")).toBe(String(EMAIL_MAX_LENGTH));
    expect(password.attributes("maxlength")).toBe(String(PASSWORD_MAX_LENGTH));
    expect(password.attributes("minlength")).toBe(String(PASSWORD_MIN_LENGTH));
    expect(otp.attributes("maxlength")).toBe(String(OTP_INPUT_LENGTH));
    expect(otp.attributes("minlength")).toBe(String(OTP_INPUT_LENGTH));

    await email.setValue(`${"a".repeat(EMAIL_MAX_LENGTH)}@x.invalid`);
    await password.setValue("password1");
    await otp.setValue("123456");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(login).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(`邮箱最长 ${EMAIL_MAX_LENGTH}`);

    await email.setValue("editor@microfocus.local");
    await password.setValue("p".repeat(PASSWORD_MAX_LENGTH + 1));
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(login).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(`密码最长 ${PASSWORD_MAX_LENGTH}`);

    await password.setValue("p".repeat(PASSWORD_MIN_LENGTH - 1));
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(login).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(`密码至少 ${PASSWORD_MIN_LENGTH}`);

    wrapper.unmount();
  });

  it("toggles password visibility from the field control", async () => {
    const wrapper = mount(LoginView);
    const toggle = wrapper.get('button[aria-label="显示密码"]');
    expect(wrapper.get("input[autocomplete='current-password']").attributes("type")).toBe("password");

    await toggle.trigger("click");
    expect(wrapper.get("input[autocomplete='current-password']").attributes("type")).toBe("text");
    wrapper.get('button[aria-label="隐藏密码"]');

    await wrapper.get('button[aria-label="隐藏密码"]').trigger("click");
    expect(wrapper.get("input[autocomplete='current-password']").attributes("type")).toBe("password");
    wrapper.unmount();
  });
});
