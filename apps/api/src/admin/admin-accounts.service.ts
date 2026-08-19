import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ADMIN_DISPLAY_NAME_MAX_LENGTH,
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  ERROR_CODES,
  REQUEST_ID_MAX_LENGTH,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  boundListQuery,
  isAssignableAdminRole,
  isOwnedContentRole,
  type AdminAccountListResponse,
  type AdminAccountView,
  type AdminSetupLinkResponse,
  type CreateAdminAccountRequest,
  type UpdateAdminAccountRequest
} from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { currentRequestId } from "../common/http.js";
import {
  boundedListWindow,
  emptyBoundedPage,
  parsePage
} from "../common/list-pagination.js";
import { requireEntityId } from "../common/entity-id.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TotpService } from "../security/totp.service.js";
import {
  ACCOUNT_SELECT,
  MUTABLE_ACCOUNT_SELECT,
  type AdminAccountRow,
  toAdminAccountView
} from "./admin-account.mapper.js";
import { AdminSetupService } from "./admin-setup.service.js";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
    private readonly setup: AdminSetupService
  ) {}

  async list(input: {
    query?: string;
    role?: AdminRole;
    status?: AdminAccountStatus;
    page?: string;
  }): Promise<AdminAccountListResponse> {
    const pageSize = ADMIN_LIST_PAGE_SIZE;
    const window = boundedListWindow({
      page: parsePage(input.page),
      pageSize,
      maxPage: ADMIN_LIST_MAX_PAGE
    });
    if (window.exceeded) return emptyBoundedPage(window.page, pageSize);
    const query = boundListQuery(input.query ?? "");
    const where: Prisma.AdminUserWhereInput = {
      ...(input.role ? { role: input.role as never } : {}),
      ...(query
        ? {
            OR: [
              { email: { contains: query } },
              { displayName: { contains: query } }
            ]
          }
        : {}),
      ...statusWhere(input.status)
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({
        where,
        select: ACCOUNT_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: window.skip,
        take: window.take
      }),
      this.prisma.adminUser.count({ where })
    ]);
    return {
      items: rows.map(toAdminAccountView),
      page: window.page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async create(
    operatorId: string,
    body: CreateAdminAccountRequest
  ): Promise<AdminSetupLinkResponse> {
    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName);
    assertAssignableRole(body.role);
    const prepared = this.setup.prepareSetupToken(email, AdminSetupPurpose.INVITE);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockHealthyAdmins(tx);
        await this.assertOperatorOtp(tx, operatorId, body.otp);
        const existing = await tx.adminUser.findUnique({
          where: { email },
          select: { id: true }
        });
        if (existing) throw duplicateEmailError();
        const account = await tx.adminUser.create({
          data: {
            email,
            displayName,
            passwordHash: null,
            role: body.role as never,
            active: true,
            setupCompletedAt: null,
            sessionVersion: 1,
            totpEnabled: false,
            totpSecretEncrypted: null
          },
          select: ACCOUNT_SELECT
        });
        await this.setup.persistSetupToken(tx, account.id, operatorId, prepared);
        await audit(tx, operatorId, "ADMIN_ACCOUNT_CREATED", account.id, {
          role: body.role,
          purpose: prepared.purpose
        });
        return this.setup.setupLinkResponse(account, prepared);
      });
    } catch (error) {
      if (isUniqueConstraint(error)) throw duplicateEmailError();
      throw error;
    }
  }

  async update(
    operatorId: string,
    targetId: string,
    body: UpdateAdminAccountRequest
  ): Promise<AdminAccountView> {
    const id = requireEntityId(targetId, "Administrator");
    if (operatorId === id && body.role !== undefined) assertNotSelf(operatorId, id);
    if (body.role !== undefined) assertAssignableRole(body.role);
    if (body.displayName === undefined && body.role === undefined) {
      throw Errors.badRequest(
        ERROR_CODES.ADMIN_ACCOUNT_UPDATE_EMPTY,
        "No administrator changes supplied"
      );
    }
    const displayName =
      body.displayName === undefined ? undefined : normalizeDisplayName(body.displayName);
    return this.prisma.$transaction(async (tx) => {
      const healthyAdminIds = await lockHealthyAdmins(tx);
      await this.assertOperatorOtp(tx, operatorId, body.otp);
      const target = await loadTargetForUpdate(tx, id);
      const nextRole = body.role ?? (target.role as AdminRole);
      const roleChanged = nextRole !== target.role;
      assertLastHealthyAdmin(target, healthyAdminIds, {
        role: nextRole,
        active: target.active,
        setupCompletedAt: target.setupCompletedAt
      });
      const transferredDramas =
        roleChanged && isOwnedContentRole(target.role as AdminRole) && !isOwnedContentRole(nextRole)
          ? await transferEditorDramas(tx, target.id, body.transferEditorId)
          : 0;
      const account = await tx.adminUser.update({
        where: { id },
        data: {
          ...(displayName !== undefined ? { displayName } : {}),
          ...(roleChanged ? { role: nextRole as never, sessionVersion: { increment: 1 } } : {})
        },
        select: ACCOUNT_SELECT
      });
      await audit(tx, operatorId, "ADMIN_ACCOUNT_UPDATED", id, {
        role: nextRole,
        transferredDramas
      });
      return toAdminAccountView(account);
    });
  }

  async suspend(
    operatorId: string,
    targetId: string,
    otp: string,
    reason: string,
    transferEditorId?: string
  ): Promise<AdminAccountView> {
    const id = requireEntityId(targetId, "Administrator");
    assertNotSelf(operatorId, id);
    const auditReason = normalizeReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const healthyAdminIds = await lockHealthyAdmins(tx);
      await this.assertOperatorOtp(tx, operatorId, otp);
      const target = await loadTargetForUpdate(tx, id);
      assertLastHealthyAdmin(target, healthyAdminIds, {
        role: target.role as AdminRole,
        active: false,
        setupCompletedAt: target.setupCompletedAt
      });
      const transferredDramas =
        isOwnedContentRole(target.role as AdminRole)
          ? await transferEditorDramas(tx, target.id, transferEditorId)
          : 0;
      const account = target.active
        ? await tx.adminUser.update({
            where: { id },
            data: { active: false, sessionVersion: { increment: 1 } },
            select: ACCOUNT_SELECT
          })
        : target;
      await audit(tx, operatorId, "ADMIN_ACCOUNT_SUSPENDED", id, {
        reason: auditReason,
        transferredDramas
      });
      return toAdminAccountView(account);
    });
  }

  async activate(
    operatorId: string,
    targetId: string,
    otp: string,
    reason: string
  ): Promise<AdminAccountView> {
    const id = requireEntityId(targetId, "Administrator");
    assertNotSelf(operatorId, id);
    const auditReason = normalizeReason(reason);
    return this.prisma.$transaction(async (tx) => {
      await lockHealthyAdmins(tx);
      await this.assertOperatorOtp(tx, operatorId, otp);
      const target = await loadTargetForUpdate(tx, id);
      if (!target.setupCompletedAt) {
        throw Errors.conflict(
          ERROR_CODES.ADMIN_ACCOUNT_PENDING_SETUP,
          "Administrator setup must be completed before activation"
        );
      }
      const account = !target.active
        ? await tx.adminUser.update({
            where: { id },
            data: { active: true, sessionVersion: { increment: 1 } },
            select: ACCOUNT_SELECT
          })
        : target;
      await audit(tx, operatorId, "ADMIN_ACCOUNT_ACTIVATED", id, {
        reason: auditReason
      });
      return toAdminAccountView(account);
    });
  }

  async reissueSetupLink(
    operatorId: string,
    targetId: string,
    otp: string,
    reason: string
  ): Promise<AdminSetupLinkResponse> {
    const id = requireEntityId(targetId, "Administrator");
    assertNotSelf(operatorId, id);
    return this.issueExistingAccountToken(
      operatorId,
      id,
      otp,
      normalizeReason(reason),
      AdminSetupPurpose.INVITE
    );
  }

  async resetCredentials(
    operatorId: string,
    targetId: string,
    otp: string,
    reason: string,
    transferEditorId?: string
  ): Promise<AdminSetupLinkResponse> {
    const id = requireEntityId(targetId, "Administrator");
    assertNotSelf(operatorId, id);
    return this.issueExistingAccountToken(
      operatorId,
      id,
      otp,
      normalizeReason(reason),
      AdminSetupPurpose.CREDENTIAL_RESET,
      transferEditorId
    );
  }

  private async issueExistingAccountToken(
    operatorId: string,
    targetId: string,
    otp: string,
    reason: string,
    purpose: AdminSetupPurpose,
    transferEditorId?: string
  ): Promise<AdminSetupLinkResponse> {
    const targetBefore = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      select: { email: true }
    });
    if (!targetBefore) throw Errors.notFound("Administrator");
    const prepared = this.setup.prepareSetupToken(targetBefore.email, purpose);
    return this.prisma.$transaction(async (tx) => {
      const healthyAdminIds = await lockHealthyAdmins(tx);
      await this.assertOperatorOtp(tx, operatorId, otp);
      const target = await loadTargetForUpdate(tx, targetId);
      if (purpose === AdminSetupPurpose.INVITE && target.setupCompletedAt) {
        throw Errors.conflict(
          ERROR_CODES.ADMIN_SETUP_NOT_PENDING,
          "Administrator setup is already complete"
        );
      }
      let transferredDramas = 0;
      if (purpose === AdminSetupPurpose.CREDENTIAL_RESET) {
        if (!target.setupCompletedAt) {
          throw Errors.conflict(
            ERROR_CODES.ADMIN_SETUP_NOT_PENDING,
            "Administrator setup is already pending"
          );
        }
        assertLastHealthyAdmin(target, healthyAdminIds, {
          role: target.role as AdminRole,
          active: false,
          setupCompletedAt: null
        });
        transferredDramas =
          isOwnedContentRole(target.role as AdminRole)
            ? await transferEditorDramas(tx, target.id, transferEditorId)
            : 0;
        await tx.adminUser.update({
          where: { id: target.id },
          data: {
            passwordHash: null,
            active: false,
            setupCompletedAt: null,
            sessionVersion: { increment: 1 },
            totpEnabled: false,
            totpSecretEncrypted: null
          }
        });
      }
      await this.setup.persistSetupToken(tx, target.id, operatorId, prepared);
      const account = await tx.adminUser.findUniqueOrThrow({
        where: { id: target.id },
        select: ACCOUNT_SELECT
      });
      await audit(
        tx,
        operatorId,
        purpose === AdminSetupPurpose.INVITE
          ? "ADMIN_SETUP_LINK_REISSUED"
          : "ADMIN_CREDENTIAL_RESET_REQUESTED",
        target.id,
        { purpose, reason, transferredDramas }
      );
      return this.setup.setupLinkResponse(account, prepared);
    });
  }

  private async assertOperatorOtp(
    tx: Transaction,
    operatorId: string,
    otp: string
  ): Promise<void> {
    const operator = await tx.adminUser.findUnique({
      where: { id: operatorId },
      select: {
        role: true,
        active: true,
        setupCompletedAt: true,
        totpEnabled: true,
        totpSecretEncrypted: true
      }
    });
    if (
      !operator ||
      operator.role !== AdminRole.ADMIN ||
      !operator.active ||
      !operator.setupCompletedAt
    ) {
      throw Errors.forbidden("INSUFFICIENT_ROLE", "Only active administrators may manage accounts");
    }
    if (!this.totp.verifyAdminOtp(operator, otp)) {
      throw Errors.unauthorized(
        "Invalid administrator one-time password",
        ERROR_CODES.ADMIN_OTP_INVALID
      );
    }
  }
}

function statusWhere(status?: AdminAccountStatus): Prisma.AdminUserWhereInput {
  if (status === AdminAccountStatus.PENDING_SETUP) return { setupCompletedAt: null };
  if (status === AdminAccountStatus.ACTIVE) {
    return { setupCompletedAt: { not: null }, active: true };
  }
  if (status === AdminAccountStatus.SUSPENDED) {
    return { setupCompletedAt: { not: null }, active: false };
  }
  return {};
}

async function lockHealthyAdmins(tx: Transaction): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM AdminUser WHERE role = 'ADMIN' AND active = true AND setupCompletedAt IS NOT NULL ORDER BY id FOR UPDATE`
  );
  return rows.map((row) => row.id);
}

async function loadTargetForUpdate(tx: Transaction, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM AdminUser WHERE id = ${id} FOR UPDATE`);
  const target = await tx.adminUser.findUnique({
    where: { id },
    select: MUTABLE_ACCOUNT_SELECT
  });
  if (!target) throw Errors.notFound("Administrator");
  return target;
}

function assertLastHealthyAdmin(
  target: AdminAccountRow,
  healthyAdminIds: string[],
  next: { role: AdminRole; active: boolean; setupCompletedAt: Date | null }
): void {
  const currentlyHealthy =
    target.role === AdminRole.ADMIN && target.active && Boolean(target.setupCompletedAt);
  const remainsHealthy =
    next.role === AdminRole.ADMIN && next.active && Boolean(next.setupCompletedAt);
  if (currentlyHealthy && !remainsHealthy && healthyAdminIds.length <= 1) {
    throw Errors.conflict(
      ERROR_CODES.LAST_ACTIVE_ADMIN,
      "The last active administrator must remain available"
    );
  }
}

async function transferEditorDramas(
  tx: Transaction,
  editorId: string,
  transferEditorId?: string
): Promise<number> {
  const dramaCount = await tx.drama.count({ where: { editorId } });
  if (dramaCount === 0) return 0;
  if (!transferEditorId) {
    throw Errors.conflict(
      ERROR_CODES.EDITOR_TRANSFER_REQUIRED,
      "An active replacement editor is required"
    );
  }
  const replacementId = requireEntityId(transferEditorId, "Replacement editor");
  if (replacementId === editorId) {
    throw Errors.conflict(
      ERROR_CODES.EDITOR_TRANSFER_INVALID,
      "Replacement editor must be a different active editor"
    );
  }
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM AdminUser WHERE id = ${replacementId} FOR UPDATE`
  );
  const replacement = await tx.adminUser.findUnique({
    where: { id: replacementId },
    select: { role: true, active: true, setupCompletedAt: true }
  });
  if (
    !replacement ||
    replacement.role !== AdminRole.EDITOR ||
    !replacement.active ||
    !replacement.setupCompletedAt
  ) {
    throw Errors.conflict(
      ERROR_CODES.EDITOR_TRANSFER_INVALID,
      "Replacement editor must be a different active editor"
    );
  }
  const result = await tx.drama.updateMany({
    where: { editorId },
    data: { editorId: replacementId }
  });
  return result.count;
}

function assertNotSelf(operatorId: string, targetId: string): void {
  if (operatorId === targetId) {
    throw Errors.forbidden(
      ERROR_CODES.ADMIN_SELF_ACTION_FORBIDDEN,
      "Administrators may not manage their own account"
    );
  }
}

function assertAssignableRole(role: AdminRole): void {
  if (!isAssignableAdminRole(role)) {
    throw Errors.badRequest("VALIDATION_ERROR", "New administrator roles must be EDITOR or ADMIN");
  }
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX_LENGTH) {
    throw Errors.badRequest(ERROR_CODES.INVALID_ADMIN_EMAIL, "Administrator email is invalid");
  }
  return email;
}

function normalizeDisplayName(value: string): string {
  const displayName = value.trim();
  if (!displayName || displayName.length > ADMIN_DISPLAY_NAME_MAX_LENGTH) {
    throw Errors.badRequest(
      ERROR_CODES.INVALID_ADMIN_DISPLAY_NAME,
      "Administrator display name is invalid"
    );
  }
  return displayName;
}

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (reason.length < ADMIN_REASON_MIN_LENGTH || reason.length > ADMIN_REASON_MAX_LENGTH) {
    throw Errors.badRequest(
      ERROR_CODES.INVALID_ADMIN_REASON,
      "Administrator action reason is invalid"
    );
  }
  return reason;
}

function duplicateEmailError() {
  return Errors.conflict(
    ERROR_CODES.ADMIN_EMAIL_ALREADY_EXISTS,
    "Administrator email already exists"
  );
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function audit(
  tx: Transaction,
  adminId: string,
  action: string,
  targetId: string,
  metadata?: Record<string, string | number>
): Promise<void> {
  const requestId = currentRequestId().slice(0, REQUEST_ID_MAX_LENGTH);
  await tx.auditLog.create({
    data: {
      adminId,
      action,
      targetType: "AdminUser",
      targetId,
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: metadata } : {})
    }
  });
}
