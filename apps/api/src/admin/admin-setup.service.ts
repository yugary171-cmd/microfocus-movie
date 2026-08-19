import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ADMIN_SETUP_PAGE_PATH,
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  ADMIN_SETUP_TOKEN_MAX_LENGTH,
  ADMIN_SETUP_TOKEN_TTL_SECONDS,
  ERROR_CODES,
  PASSWORD_MAX_LENGTH,
  REQUEST_ID_MAX_LENGTH,
  AdminRole,
  AdminSetupPurpose,
  type AdminSetupCompleteResponse,
  type AdminSetupInspectResponse,
  type AdminSetupLinkResponse,
  type CompleteAdminSetupRequest
} from "@microfocus/contracts";
import { hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { Errors } from "../common/app-error.js";
import { currentRequestId } from "../common/http.js";
import { AppConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TotpService } from "../security/totp.service.js";
import {
  ACCOUNT_SELECT,
  MUTABLE_ACCOUNT_SELECT,
  type AdminAccountRow,
  toAdminAccountView
} from "./admin-account.mapper.js";

type Transaction = Prisma.TransactionClient;

export type PreparedSetupToken = {
  rawToken: string;
  tokenDigest: string;
  encryptedSecret: string;
  expiresAt: Date;
  purpose: AdminSetupPurpose;
};

@Injectable()
export class AdminSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly totp: TotpService
  ) {}

  prepareSetupToken(email: string, purpose: AdminSetupPurpose): PreparedSetupToken {
    const rawToken = randomBytes(32).toString("base64url");
    const { encryptedSecret } = this.totp.createSetupSecret(email);
    return {
      rawToken,
      tokenDigest: setupTokenDigest(rawToken),
      encryptedSecret,
      expiresAt: new Date(Date.now() + ADMIN_SETUP_TOKEN_TTL_SECONDS * 1000),
      purpose
    };
  }

  async persistSetupToken(
    tx: Transaction,
    adminUserId: string,
    operatorId: string,
    prepared: PreparedSetupToken
  ): Promise<void> {
    const now = new Date();
    await tx.adminSetupToken.updateMany({
      where: { adminUserId, usedAt: null },
      data: { usedAt: now }
    });
    await tx.adminSetupToken.create({
      data: {
        adminUserId,
        purpose: prepared.purpose as never,
        tokenDigest: prepared.tokenDigest,
        totpSecretEncrypted: prepared.encryptedSecret,
        expiresAt: prepared.expiresAt,
        createdByAdminId: operatorId
      }
    });
  }

  setupLinkResponse(
    account: AdminAccountRow,
    prepared: PreparedSetupToken
  ): AdminSetupLinkResponse {
    const origin = this.config.env.ADMIN_ORIGIN.replace(/\/$/, "");
    return {
      account: toAdminAccountView(account),
      purpose: prepared.purpose,
      setupToken: prepared.rawToken,
      setupUrl: `${origin}${ADMIN_SETUP_PAGE_PATH}#token=${prepared.rawToken}`,
      expiresAt: prepared.expiresAt.toISOString()
    };
  }

  async inspectSetup(token: string): Promise<AdminSetupInspectResponse> {
    const row = await this.loadSetupToken(token, new Date());
    const revealed = this.totp.revealSetupSecret(
      row.adminUser.email,
      row.totpSecretEncrypted
    );
    return {
      email: row.adminUser.email,
      displayName: row.adminUser.displayName,
      role: row.adminUser.role as AdminRole,
      purpose: row.purpose as AdminSetupPurpose,
      expiresAt: row.expiresAt.toISOString(),
      ...revealed
    };
  }

  async completeSetup(body: CompleteAdminSetupRequest): Promise<AdminSetupCompleteResponse> {
    assertSetupPassword(body.password);
    const initial = await this.loadSetupToken(body.token, new Date());
    if (!this.totp.verifySetupOtp(initial.totpSecretEncrypted, body.otp)) {
      throw Errors.unauthorized(
        "Invalid administrator one-time password",
        ERROR_CODES.ADMIN_OTP_INVALID
      );
    }
    const passwordHash = await hash(body.password, 12);
    const digest = setupTokenDigest(normalizeSetupToken(body.token));
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM AdminSetupToken WHERE tokenDigest = ${digest} FOR UPDATE`
      );
      const completionTime = new Date();
      const row = assertSetupTokenUsable(
        await tx.adminSetupToken.findUnique({
          where: { tokenDigest: digest },
          include: { adminUser: { select: MUTABLE_ACCOUNT_SELECT } }
        }),
        completionTime
      );
      if (row.id !== initial.id) throw invalidSetupTokenError();
      const account = await tx.adminUser.update({
        where: { id: row.adminUserId },
        data: {
          passwordHash,
          active: true,
          setupCompletedAt: completionTime,
          sessionVersion: { increment: 1 },
          totpEnabled: true,
          totpSecretEncrypted: row.totpSecretEncrypted
        },
        select: ACCOUNT_SELECT
      });
      await tx.adminSetupToken.update({
        where: { id: row.id },
        data: { usedAt: completionTime }
      });
      await tx.adminSetupToken.updateMany({
        where: { adminUserId: row.adminUserId, usedAt: null, id: { not: row.id } },
        data: { usedAt: completionTime }
      });
      await auditSetupCompletion(tx, row.adminUserId, row.purpose);
      return { account: toAdminAccountView(account) };
    });
  }

  private async loadSetupToken(token: string, now: Date) {
    const digest = setupTokenDigest(normalizeSetupToken(token));
    const row = await this.prisma.adminSetupToken.findUnique({
      where: { tokenDigest: digest },
      include: { adminUser: { select: MUTABLE_ACCOUNT_SELECT } }
    });
    return assertSetupTokenUsable(row, now);
  }
}

function normalizeSetupToken(value: string): string {
  const token = value.trim();
  if (token.length < 32 || token.length > ADMIN_SETUP_TOKEN_MAX_LENGTH) {
    throw invalidSetupTokenError();
  }
  return token;
}

function setupTokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function assertSetupPassword(password: string): void {
  if (
    password.length < ADMIN_SETUP_PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw Errors.badRequest(
      ERROR_CODES.INVALID_ADMIN_SETUP_PASSWORD,
      `Administrator password must be ${ADMIN_SETUP_PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`
    );
  }
}

function assertSetupTokenUsable<
  T extends {
    id: string;
    usedAt: Date | null;
    expiresAt: Date;
    adminUserId: string;
    purpose: string;
    totpSecretEncrypted: string;
    adminUser: AdminAccountRow;
  }
>(row: T | null, now: Date): T {
  if (!row) throw invalidSetupTokenError();
  if (row.usedAt) {
    throw Errors.conflict(
      ERROR_CODES.ADMIN_SETUP_TOKEN_USED,
      "Administrator setup token has already been used"
    );
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    throw Errors.unauthorized(
      "Administrator setup token has expired",
      ERROR_CODES.ADMIN_SETUP_TOKEN_EXPIRED
    );
  }
  return row;
}

function invalidSetupTokenError() {
  return Errors.unauthorized(
    "Administrator setup token is invalid",
    ERROR_CODES.ADMIN_SETUP_TOKEN_INVALID
  );
}

async function auditSetupCompletion(
  tx: Transaction,
  adminUserId: string,
  purpose: string
): Promise<void> {
  const requestId = currentRequestId().slice(0, REQUEST_ID_MAX_LENGTH);
  await tx.auditLog.create({
    data: {
      adminId: adminUserId,
      action: "ADMIN_SETUP_COMPLETED",
      targetType: "AdminUser",
      targetId: adminUserId,
      ...(requestId ? { requestId } : {}),
      metadataJson: { purpose }
    }
  });
  await tx.operationalEvent.create({
    data: {
      eventType: "ADMIN_SETUP_COMPLETED",
      actorType: "ADMIN_SETUP",
      actorId: adminUserId,
      entityType: "AdminUser",
      entityId: adminUserId,
      ...(requestId ? { requestId } : {}),
      metadataJson: { purpose }
    }
  });
}
