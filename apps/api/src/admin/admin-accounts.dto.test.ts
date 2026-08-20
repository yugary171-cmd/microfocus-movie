import {
  ADMIN_DISPLAY_NAME_MAX_LENGTH,
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  API_ROUTES,
  PASSWORD_MAX_LENGTH,
  AdminRole
} from "@microfocus/contracts";
import { Reflector } from "@nestjs/core";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { AdminRolesGuard } from "../security/security.js";
import { AdminAccountsController } from "./admin-accounts.controller.js";
import {
  AdminAccountSensitiveActionDto,
  CompleteAdminSetupDto,
  CreateAdminAccountDto,
  CreateAdminSetupLinkDto,
  UpdateAdminAccountDto
} from "./admin-accounts.dto.js";

describe("administrator account DTO limits", () => {
  it("accepts bounded account creation and rejects invalid OTP or names", async () => {
    expect(
      await validate(
        plainToInstance(CreateAdminAccountDto, {
          email: "new@example.com",
          displayName: "新管理员",
          role: AdminRole.EDITOR,
          otp: "123456",
          reason: "新增内容编辑账号"
        })
      )
    ).toEqual([]);
    const invalid = await validate(
      plainToInstance(CreateAdminAccountDto, {
        email: "new@example.com",
        displayName: "x".repeat(ADMIN_DISPLAY_NAME_MAX_LENGTH + 1),
        role: AdminRole.EDITOR,
        otp: "not-otp",
        reason: "新增内容编辑账号"
      })
    );
    expect(invalid.some((error) => error.property === "displayName")).toBe(true);
    expect(invalid.some((error) => error.property === "otp")).toBe(true);
  });

  it("accepts a non-email login id and rejects spaces", async () => {
    expect(
      await validate(
        plainToInstance(CreateAdminAccountDto, {
          email: "stellan",
          displayName: "新管理员",
          role: AdminRole.EDITOR,
          otp: "123456",
          reason: "新增内容编辑账号"
        })
      )
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(CreateAdminAccountDto, {
            email: "ste llan",
            displayName: "新管理员",
            role: AdminRole.EDITOR,
            otp: "123456",
            reason: "新增内容编辑账号"
          })
        )
      ).some((error) => error.property === "email")
    ).toBe(true);
  });

  it("rejects REVIEWER when creating or changing an assignable role", async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateAdminAccountDto, {
            email: "new@example.com",
            displayName: "新管理员",
            role: AdminRole.REVIEWER,
            otp: "123456",
            reason: "新增内容编辑账号"
          })
        )
      ).some((error) => error.property === "role")
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(UpdateAdminAccountDto, {
            role: AdminRole.REVIEWER,
            otp: "123456",
            reason: "调整账号角色"
          })
        )
      ).some((error) => error.property === "role")
    ).toBe(true);
  });

  it("bounds transfer editor ids and setup passwords", async () => {
    expect(
      await validate(
        plainToInstance(UpdateAdminAccountDto, {
          role: AdminRole.EDITOR,
          transferEditorId: "editor-2",
          otp: "123456",
          reason: "调整账号角色"
        })
      )
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(CompleteAdminSetupDto, {
            token: "t".repeat(43),
            password: "x".repeat(ADMIN_SETUP_PASSWORD_MIN_LENGTH - 1),
            otp: "123456"
          })
        )
      ).some((error) => error.property === "password")
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(CompleteAdminSetupDto, {
            token: "t".repeat(43),
            password: "x".repeat(PASSWORD_MAX_LENGTH + 1),
            otp: "123456"
          })
        )
      ).some((error) => error.property === "password")
    ).toBe(true);
  });

  it("accepts the combined setup-link compatibility request", async () => {
    expect(
      await validate(
        plainToInstance(CreateAdminSetupLinkDto, {
          purpose: "CREDENTIAL_RESET",
          reason: "管理员凭据重置",
          replacementEditorId: "editor-2",
          otp: "123456"
        })
      )
    ).toEqual([]);
  });

  it("requires a bounded reason for suspend, activate, reissue, and reset actions", async () => {
    const missing = await validate(
      plainToInstance(AdminAccountSensitiveActionDto, { otp: "123456" })
    );
    expect(missing.some((error) => error.property === "reason")).toBe(true);
    expect(
      await validate(
        plainToInstance(AdminAccountSensitiveActionDto, {
          otp: "123456",
          reason: "管理员账号状态调整"
        })
      )
    ).toEqual([]);
  });
});

describe("administrator account controller authorization", () => {
  it("accepts the parallel frontend query and setup-link compatibility aliases", async () => {
    const accounts = {
      list: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      resetCredentials: vi.fn().mockResolvedValue({ purpose: "CREDENTIAL_RESET" })
    };
    const controller = new AdminAccountsController(accounts as never);
    await controller.list("", "账号", undefined, undefined, "1");
    expect(accounts.list).toHaveBeenCalledWith({ query: "账号", page: "1" });

    await controller.createSetupLink(
      { kind: "admin", sub: "admin-1", role: AdminRole.ADMIN },
      "editor-1",
      {
        purpose: "CREDENTIAL_RESET" as never,
        reason: "凭据重置处理",
        replacementEditorId: "editor-2",
        otp: "123456"
      }
    );
    expect(accounts.resetCredentials).toHaveBeenCalledWith(
      "admin-1",
      "editor-1",
      "123456",
      "凭据重置处理",
      "editor-2"
    );
  });

  it("keeps account-management and public setup routes stable", () => {
    expect(API_ROUTES.admin.accounts).toBe("/v1/admin/accounts");
    expect(API_ROUTES.admin.account("admin-1")).toBe("/v1/admin/accounts/admin-1");
    expect(API_ROUTES.admin.accountSuspend("admin-1")).toBe(
      "/v1/admin/accounts/admin-1/suspend"
    );
    expect(API_ROUTES.admin.accountActivate("admin-1")).toBe(
      "/v1/admin/accounts/admin-1/activate"
    );
    expect(API_ROUTES.admin.accountSetupLink("admin-1")).toBe(
      "/v1/admin/accounts/admin-1/setup-link"
    );
    expect(API_ROUTES.admin.accountSetupLinks("admin-1")).toBe(
      "/v1/admin/accounts/admin-1/setup-links"
    );
    expect(API_ROUTES.admin.accountCredentialReset("admin-1")).toBe(
      "/v1/admin/accounts/admin-1/credential-reset"
    );
    expect(API_ROUTES.admin.setupInspect).toBe("/v1/admin/account-setup/inspect");
    expect(API_ROUTES.admin.setupComplete).toBe("/v1/admin/account-setup/complete");
  });

  it("declares ADMIN-only access for protected account routes", () => {
    const guard = new AdminRolesGuard(new Reflector());
    expect(() =>
      guard.canActivate({
        getHandler: () => AdminAccountsController.prototype.list,
        getClass: () => AdminAccountsController,
        switchToHttp: () => ({
          getRequest: () => ({
            principal: { kind: "admin", sub: "editor-1", role: AdminRole.EDITOR }
          })
        })
      } as never)
    ).toThrow(/role is insufficient/);
  });
});
