import { ADMIN_WEB_PAGE_SIZE, AdminAccountStatus, AdminRole, ERROR_CODES } from "@microfocus/contracts";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/infrastructure/api";
import AdminAccountsPage from "@/features/accounts/pages/AdminAccountsPage.vue";
import type { AdminAccountRecord } from "@/shared/types";

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  suspendAccount: vi.fn(),
  activateAccount: vi.fn(),
  createAccountSetupLink: vi.fn(),
}));

const authUser = vi.hoisted(() => ({
  value: {
    id: "admin-1",
    name: "陈管理员",
    email: "admin@example.com",
    role: "ADMIN" as AdminRole,
  },
}));

vi.mock("@/features/accounts/api", () => ({ accountsApi: api }));
vi.mock("@/infrastructure/stores", () => ({
  useAuthStore: () => ({ user: authUser.value }),
}));

const account = (overrides: Partial<AdminAccountRecord> = {}): AdminAccountRecord => ({
  id: "editor-1",
  displayName: "林编辑",
  email: "editor@example.com",
  role: AdminRole.EDITOR,
  status: AdminAccountStatus.ACTIVE,
  totpEnabled: true,
  ownedDramaCount: 2,
  setupCompletedAt: "2026-07-01T00:00:00.000Z",
  lastLoginAt: "2026-08-18T12:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-08-18T12:00:00.000Z",
  ...overrides,
});

async function openRowAction(
  wrapper: ReturnType<typeof mount>,
  label: string,
  rowIndex = 0,
): Promise<void> {
  await wrapper.findAll(".account-actions-trigger")[rowIndex]!.trigger("click");
  await flushPromises();
  const menu = bodyGetLast(".account-actions-menu");
  const button = menu.findAll("button").find((item) => item.text() === label);
  await button?.trigger("click");
  await flushPromises();
}

function bodyGet(selector: string): DOMWrapper<Element> {
  const element = document.body.querySelector(selector);
  if (!element) throw new Error(`Unable to find ${selector} in document.body`);
  return new DOMWrapper(element);
}

function bodyGetLast(selector: string): DOMWrapper<Element> {
  const elements = document.body.querySelectorAll(selector);
  const element = elements.item(elements.length - 1);
  if (!element) throw new Error(`Unable to find ${selector} in document.body`);
  return new DOMWrapper(element);
}

async function chooseSelect(root: ReturnType<typeof mount> | DOMWrapper<Element>, label: string, option: string): Promise<void> {
  const select = root.findAll(".el-select").find((item) => item.find(`[aria-label="${label}"]`).exists());
  if (!select) throw new Error(`Unable to find select ${label}`);
  await select.trigger("click");
  await flushPromises();
  const optionElement = [...document.body.querySelectorAll(".el-select-dropdown__item")]
    .find((item) => item.textContent?.trim() === option);
  if (!optionElement) throw new Error(`Unable to find option ${option}`);
  await new DOMWrapper(optionElement).trigger("click");
  await flushPromises();
}

describe("AdminAccountsPage", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    authUser.value = {
      id: "admin-1",
      name: "陈管理员",
      email: "admin@example.com",
      role: AdminRole.ADMIN,
    };
    api.listAccounts.mockResolvedValue({ items: [account()], total: 1 });
  });

  it("hides account management from non-admin roles", async () => {
    authUser.value.role = AdminRole.EDITOR;
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    expect(wrapper.text()).toContain("只有系统管理员可以管理后台账号");
    expect(api.listAccounts).not.toHaveBeenCalled();
  });

  it("filters the account list by keyword, role, and status", async () => {
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    await wrapper.get("input[type='search']").setValue("林");
    await chooseSelect(wrapper, "角色", "内容编辑");
    await chooseSelect(wrapper, "状态", "正常");
    await wrapper.get("form.toolbar").trigger("submit");
    await flushPromises();
    expect(api.listAccounts).toHaveBeenLastCalledWith("林", AdminRole.EDITOR, AdminAccountStatus.ACTIVE, 1, ADMIN_WEB_PAGE_SIZE);
  });

  it("renders account state and requires an editor handoff before suspension", async () => {
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();

    expect(wrapper.text()).toContain("林编辑");
    expect(wrapper.text()).toContain("已绑定");
    wrapper.get(".admin-table-wrap.accounts-table");

    await openRowAction(wrapper, "停用");
    expect(bodyGet(".account-dialog").text()).toContain("待移交 2 部剧目");
    expect(api.listAccounts).toHaveBeenLastCalledWith("", AdminRole.EDITOR, "ACTIVE", 1, ADMIN_WEB_PAGE_SIZE);
  });

  it("copies the login id from the account list", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    await wrapper.get('button[aria-label="复制登录名 editor@example.com"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("editor@example.com");
    wrapper.unmount();
  });

  it("creates an account and reveals the one-time link only in the success dialog", async () => {
    api.createAccount.mockResolvedValue({
      account: account({ id: "new-account", status: AdminAccountStatus.PENDING_SETUP, setupCompletedAt: null }),
      setupUrl: "http://localhost:5174/account-setup#token=only-once",
      setupToken: "only-once",
      expiresAt: "2026-08-19T12:00:00.000Z",
      purpose: "INVITE",
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();

    const create = wrapper.findAll("button").find((button) => button.text() === "新增账号");
    await create?.trigger("click");
    const dialog = bodyGet(".account-dialog");
    const inputs = dialog.findAll("input");
    await inputs[0]!.setValue("王审核");
    await inputs[1]!.setValue("Reviewer@Example.com");
    await chooseSelect(dialog, "角色", "内容编辑");
    await dialog.get("textarea").setValue("新增同事负责短剧内容");
    await dialog.get("input[autocomplete='one-time-code']").setValue("123456");
    await dialog.trigger("submit");
    await flushPromises();

    expect(api.createAccount).toHaveBeenCalledWith({
      displayName: "王审核",
      email: "reviewer@example.com",
      role: AdminRole.EDITOR,
      otp: "123456",
      reason: "新增同事负责短剧内容",
    });
    expect(bodyGet(".setup-link-dialog").text()).toContain("仅本次显示");
    expect((bodyGet("textarea[readonly]").element as HTMLTextAreaElement).value).toContain("only-once");

    await bodyGet(".setup-link-dialog .button--secondary").trigger("click");
    expect(writeText).toHaveBeenCalledWith("http://localhost:5174/account-setup#token=only-once");
    await bodyGet(".setup-link-dialog .button--primary").trigger("click");
    expect(document.body.querySelector('[data-testid="setup-link-dialog"]')).toBeNull();
  });

  it("does not submit an unchanged role when editing an account profile", async () => {
    api.updateAccount.mockResolvedValue(account({ displayName: "新姓名" }));
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    await openRowAction(wrapper, "编辑资料/角色");
    const dialog = bodyGet(".account-dialog");
    await dialog.find("input").setValue("新姓名");
    await dialog.get("textarea").setValue("更新管理员展示姓名");
    await dialog.get("input[autocomplete='one-time-code']").setValue("123456");
    await dialog.trigger("submit");
    await flushPromises();

    expect(api.updateAccount).toHaveBeenCalledWith("editor-1", {
      displayName: "新姓名",
      otp: "123456",
      reason: "更新管理员展示姓名",
    });
  });

  it("disables self suspend and reset, and maps last-admin API errors", async () => {
    api.listAccounts.mockResolvedValue({
      items: [account({ id: "admin-1", displayName: "陈管理员", role: AdminRole.ADMIN, ownedDramaCount: 0 })],
      total: 1,
    });
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    await wrapper.get(".account-actions-trigger").trigger("click");
    const menu = bodyGet(".account-actions-menu");
    const suspend = menu.findAll("button").find((button) => button.text() === "停用");
    const reset = menu.findAll("button").find((button) => button.text() === "重置登录凭据");
    expect(suspend?.attributes("disabled")).toBeDefined();
    expect(reset?.attributes("disabled")).toBeDefined();

    api.suspendAccount.mockRejectedValue(
      new ApiClientError("The last active administrator must remain available", {
        code: ERROR_CODES.LAST_ACTIVE_ADMIN,
      }),
    );
    api.listAccounts.mockResolvedValue({
      items: [account({ id: "admin-2", displayName: "备用管理员", role: AdminRole.ADMIN, ownedDramaCount: 0 })],
      total: 1,
    });
    const other = mount(AdminAccountsPage);
    await flushPromises();
    await openRowAction(other, "停用");
    const form = bodyGet(".account-dialog");
    await form.get("textarea").setValue("管理员离职需要停用账号");
    await form.get("input[autocomplete='one-time-code']").setValue("123456");
    await form.trigger("submit");
    await flushPromises();
    expect(bodyGet(".account-dialog").text()).toContain("必须至少保留一个正常的系统管理员");
    wrapper.unmount();
    other.unmount();
  });

  it("activates a suspended account and resends a pending setup link", async () => {
    api.listAccounts.mockResolvedValue({
      items: [
        account({
          id: "reviewer-9",
          displayName: "周审核",
          role: AdminRole.REVIEWER,
          status: AdminAccountStatus.SUSPENDED,
          ownedDramaCount: 0,
        }),
      ],
      total: 1,
    });
    api.activateAccount.mockResolvedValue(account({ status: AdminAccountStatus.ACTIVE, ownedDramaCount: 0 }));
    const wrapper = mount(AdminAccountsPage);
    await flushPromises();
    await openRowAction(wrapper, "启用");
    const form = bodyGet(".account-dialog");
    await form.get("textarea").setValue("账号重新启用用于审核");
    await form.get("input[autocomplete='one-time-code']").setValue("123456");
    await form.trigger("submit");
    await flushPromises();
    expect(api.activateAccount).toHaveBeenCalledWith("reviewer-9", {
      reason: "账号重新启用用于审核",
      otp: "123456",
    });

    api.listAccounts.mockResolvedValue({
      items: [
        account({
          id: "pending-1",
          displayName: "待开通",
          status: AdminAccountStatus.PENDING_SETUP,
          setupCompletedAt: null,
          ownedDramaCount: 0,
        }),
      ],
      total: 1,
    });
    api.createAccountSetupLink.mockResolvedValue({
      account: account({ id: "pending-1", status: AdminAccountStatus.PENDING_SETUP }),
      setupUrl: "http://localhost:5174/account-setup#token=reissued",
      setupToken: "reissued",
      expiresAt: "2026-08-19T12:00:00.000Z",
      purpose: "INVITE",
    });
    const pending = mount(AdminAccountsPage);
    await flushPromises();
    await openRowAction(pending, "重发开通链接");
    const invite = bodyGet(".account-dialog");
    await invite.get("textarea").setValue("同事未收到开通邮件改用链接");
    await invite.get("input[autocomplete='one-time-code']").setValue("123456");
    await invite.trigger("submit");
    await flushPromises();
    expect(api.createAccountSetupLink).toHaveBeenCalledWith("pending-1", {
      purpose: "INVITE",
      reason: "同事未收到开通邮件改用链接",
      otp: "123456",
    });
    expect(bodyGet(".setup-link-dialog").text()).toContain("仅本次显示");
    wrapper.unmount();
    pending.unmount();
  });

  it("keeps a single floating action menu and closes it from outside clicks", async () => {
    api.listAccounts.mockResolvedValue({
      items: [
        account({ id: "editor-1" }),
        account({ id: "editor-2", displayName: "赵编辑", email: "editor-2@example.com" }),
      ],
      total: 2,
    });
    const wrapper = mount(AdminAccountsPage, { attachTo: document.body });
    await flushPromises();
    const triggers = wrapper.findAll(".account-actions-trigger");
    await triggers[0]!.trigger("click");
    expect(document.body.querySelectorAll(".account-actions-menu")).toHaveLength(1);
    expect(bodyGet(".account-actions-menu").text()).toContain("停用");

    await triggers[1]!.trigger("click");
    expect(document.body.querySelectorAll(".account-actions-menu")).toHaveLength(1);

    document.dispatchEvent(new Event("pointerdown"));
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="account-actions-menu"]')).toBeNull();
    wrapper.unmount();
  });
});
