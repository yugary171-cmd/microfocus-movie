import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  API_ROUTES,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  type AdminAccountListResponse,
  type AdminAccountView,
  type AdminSetupCompleteResponse,
  type AdminSetupInspectResponse,
  type AdminSetupLinkResponse
} from "@microfocus/contracts";
import { controllerPath, nestedControllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import {
  AdminRolesGuard,
  CurrentPrincipal,
  JwtAuthGuard,
  Roles,
  type Principal
} from "../security/security.js";
import { AdminWriteRateLimitGuard } from "../security/admin-write-rate-limit.js";
import { AdminSetupRateLimitGuard } from "../security/admin-setup-rate-limit.js";
import {
  AdminAccountSensitiveActionDto,
  CompleteAdminSetupDto,
  CreateAdminAccountDto,
  CreateAdminSetupLinkDto,
  InspectAdminSetupDto,
  UpdateAdminAccountDto
} from "./admin-accounts.dto.js";
import { AdminAccountsService } from "./admin-accounts.service.js";
import { AdminSetupService } from "./admin-setup.service.js";

function accountPath(route: string): string {
  return nestedControllerPath(route, API_ROUTES.admin.accounts);
}

@Controller(controllerPath(API_ROUTES.admin.accounts))
@UseGuards(JwtAuthGuard, AdminRolesGuard, AdminWriteRateLimitGuard)
@Roles(AdminRole.ADMIN)
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get()
  list(
    @Query("q") query = "",
    @Query("query") compatibleQuery = "",
    @Query("role") role?: string,
    @Query("status") status?: string,
    @Query("page") page = "1"
  ): Promise<AdminAccountListResponse> {
    return this.accounts.list({
      query: query || compatibleQuery,
      page,
      ...(isAdminRole(role) ? { role } : {}),
      ...(isAdminAccountStatus(status) ? { status } : {})
    });
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateAdminAccountDto
  ): Promise<AdminSetupLinkResponse> {
    return this.accounts.create(requireAdminId(principal), body);
  }

  @Patch(accountPath(API_ROUTES.admin.account(":adminId")))
  update(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: UpdateAdminAccountDto
  ): Promise<AdminAccountView> {
    const transferEditorId = requestedTransferEditorId(body);
    return this.accounts.update(requireAdminId(principal), adminId, {
      ...body,
      ...(transferEditorId ? { transferEditorId } : {})
    });
  }

  @Post(accountPath(API_ROUTES.admin.accountSuspend(":adminId")))
  suspend(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: AdminAccountSensitiveActionDto
  ): Promise<AdminAccountView> {
    return this.accounts.suspend(
      requireAdminId(principal),
      adminId,
      body.otp,
      body.reason,
      requestedTransferEditorId(body)
    );
  }

  @Post(accountPath(API_ROUTES.admin.accountActivate(":adminId")))
  activate(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: AdminAccountSensitiveActionDto
  ): Promise<AdminAccountView> {
    return this.accounts.activate(requireAdminId(principal), adminId, body.otp, body.reason);
  }

  @Post(accountPath(API_ROUTES.admin.accountSetupLink(":adminId")))
  reissueSetupLink(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: AdminAccountSensitiveActionDto
  ): Promise<AdminSetupLinkResponse> {
    return this.accounts.reissueSetupLink(
      requireAdminId(principal),
      adminId,
      body.otp,
      body.reason
    );
  }

  @Post(accountPath(API_ROUTES.admin.accountSetupLinks(":adminId")))
  createSetupLink(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: CreateAdminSetupLinkDto
  ): Promise<AdminSetupLinkResponse> {
    const operatorId = requireAdminId(principal);
    if (body.purpose === AdminSetupPurpose.CREDENTIAL_RESET) {
      return this.accounts.resetCredentials(
        operatorId,
        adminId,
        body.otp,
        body.reason,
        requestedTransferEditorId(body)
      );
    }
    return this.accounts.reissueSetupLink(operatorId, adminId, body.otp, body.reason);
  }

  @Post(accountPath(API_ROUTES.admin.accountCredentialReset(":adminId")))
  resetCredentials(
    @CurrentPrincipal() principal: Principal,
    @Param("adminId") adminId: string,
    @Body() body: AdminAccountSensitiveActionDto
  ): Promise<AdminSetupLinkResponse> {
    return this.accounts.resetCredentials(
      requireAdminId(principal),
      adminId,
      body.otp,
      body.reason,
      requestedTransferEditorId(body)
    );
  }
}

@Controller()
@UseGuards(AdminSetupRateLimitGuard)
export class AdminSetupController {
  constructor(private readonly setup: AdminSetupService) {}

  @Post(controllerPath(API_ROUTES.admin.setupInspect))
  inspect(@Body() body: InspectAdminSetupDto): Promise<AdminSetupInspectResponse> {
    return this.setup.inspectSetup(body.token);
  }

  @Post(controllerPath(API_ROUTES.admin.setupComplete))
  complete(@Body() body: CompleteAdminSetupDto): Promise<AdminSetupCompleteResponse> {
    return this.setup.completeSetup(body);
  }
}

function requireAdminId(principal: Principal): string {
  if (principal.kind !== "admin" || principal.role !== AdminRole.ADMIN) {
    throw Errors.forbidden("INSUFFICIENT_ROLE", "Only administrators may manage accounts");
  }
  return principal.sub;
}

function isAdminRole(value: string | undefined): value is AdminRole {
  return value !== undefined && Object.values(AdminRole).includes(value as AdminRole);
}

function isAdminAccountStatus(value: string | undefined): value is AdminAccountStatus {
  return (
    value !== undefined &&
    Object.values(AdminAccountStatus).includes(value as AdminAccountStatus)
  );
}

function requestedTransferEditorId(input: {
  transferEditorId?: string;
  replacementEditorId?: string;
}): string | undefined {
  return input.transferEditorId ?? input.replacementEditorId;
}
