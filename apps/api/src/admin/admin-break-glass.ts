import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH
} from "@microfocus/contracts";
import { AdminRole, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { encryptTotpSecret } from "../security/totp-crypto.js";
import { assertTotpSecretBase32, isExampleTotpSecret } from "../security/totp-secret.js";
import { buildOtpauthUri, generateTotpManualKey } from "../security/totp.service.js";

export const ADMIN_BREAK_GLASS_CONFIRMATION = "RESET_ADMIN_ACCESS";
export const ADMIN_BREAK_GLASS_ACTION = "ADMIN_BREAK_GLASS_RECOVERY";

export type BreakGlassCommand = {
  commit: boolean;
  confirmation: string;
  email: string;
  password: string;
  reason: string;
  totpSecret: string | undefined;
  encryptionKey: string;
  nodeEnv: string;
};

export type PreparedBreakGlass = {
  commit: boolean;
  email: string;
  reason: string;
  passwordHash: string;
  totpSecretEncrypted: string;
  manualKey: string;
  otpauthUri: string;
};

export type BreakGlassSummary = {
  mode: "dry-run" | "apply";
  adminId: string;
  email: string;
  sessionVersion?: number;
  otpauthUri?: string;
  manualKey?: string;
};

type BreakGlassTx = {
  adminUser: {
    findUnique: (args: Prisma.AdminUserFindUniqueArgs) => Promise<{
      id: string;
      email: string;
      role: AdminRole;
      sessionVersion: number;
    } | null>;
    update: (args: Prisma.AdminUserUpdateArgs) => Promise<{ id: string; sessionVersion: number }>;
  };
  adminSetupToken: {
    updateMany: (args: Prisma.AdminSetupTokenUpdateManyArgs) => Promise<unknown>;
  };
  auditLog: { create: (args: Prisma.AuditLogCreateArgs) => Promise<unknown> };
  operationalEvent: { create: (args: Prisma.OperationalEventCreateArgs) => Promise<unknown> };
};

export function parseBreakGlassCommand(env: NodeJS.ProcessEnv, argv: string[]): BreakGlassCommand {
  const confirmation = env.ADMIN_BREAK_GLASS_CONFIRM?.trim() ?? "";
  const email = (env.ADMIN_BREAK_GLASS_EMAIL ?? "").trim().toLowerCase();
  const password = env.ADMIN_BREAK_GLASS_PASSWORD ?? "";
  const reason = (env.ADMIN_BREAK_GLASS_REASON ?? "").trim();
  const totpSecret = env.ADMIN_BREAK_GLASS_TOTP_SECRET?.trim() || undefined;
  const encryptionKey = env.TOTP_ENCRYPTION_KEY?.trim() ?? "";
  const nodeEnv = env.NODE_ENV ?? "development";
  if (confirmation !== ADMIN_BREAK_GLASS_CONFIRMATION) {
    throw new Error(
      `Set ADMIN_BREAK_GLASS_CONFIRM=${ADMIN_BREAK_GLASS_CONFIRMATION} for this one-shot recovery`
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_BREAK_GLASS_EMAIL must be the existing administrator email");
  }
  if (
    password.length < ADMIN_SETUP_PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `ADMIN_BREAK_GLASS_PASSWORD must be ${ADMIN_SETUP_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`
    );
  }
  if (reason.length < ADMIN_REASON_MIN_LENGTH || reason.length > ADMIN_REASON_MAX_LENGTH) {
    throw new Error(
      `ADMIN_BREAK_GLASS_REASON must be ${ADMIN_REASON_MIN_LENGTH}–${ADMIN_REASON_MAX_LENGTH} characters`
    );
  }
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("TOTP_ENCRYPTION_KEY of at least 32 characters is required");
  }
  if (nodeEnv === "production" && /replace|example|change.?me/i.test(password)) {
    throw new Error("Refusing an example administrator password in production recovery");
  }
  if (totpSecret) {
    const normalized = assertTotpSecretBase32(totpSecret);
    if (nodeEnv === "production" && isExampleTotpSecret(normalized)) {
      throw new Error("Refusing an example administrator TOTP secret in production recovery");
    }
  }
  return {
    commit: argv.includes("--commit"),
    confirmation,
    email,
    password,
    reason,
    totpSecret,
    encryptionKey,
    nodeEnv
  };
}

export async function prepareBreakGlass(command: BreakGlassCommand): Promise<PreparedBreakGlass> {
  const manualKey = command.totpSecret
    ? assertTotpSecretBase32(command.totpSecret)
    : generateTotpManualKey();
  return {
    commit: command.commit,
    email: command.email,
    reason: command.reason,
    passwordHash: await hash(command.password, 12),
    totpSecretEncrypted: encryptTotpSecret(manualKey, command.encryptionKey),
    manualKey,
    otpauthUri: buildOtpauthUri(command.email, manualKey)
  };
}

export async function applyAdminBreakGlass(
  tx: BreakGlassTx,
  prepared: PreparedBreakGlass
): Promise<BreakGlassSummary> {
  const account = await tx.adminUser.findUnique({
    where: { email: prepared.email },
    select: { id: true, email: true, role: true, sessionVersion: true }
  });
  if (!account) {
    throw new Error("Administrator email was not found");
  }
  if (account.role !== AdminRole.ADMIN) {
    throw new Error("Break-glass recovery is limited to existing ADMIN accounts");
  }
  if (!prepared.commit) {
    return { mode: "dry-run", adminId: account.id, email: account.email };
  }
  const updated = await tx.adminUser.update({
    where: { id: account.id },
    data: {
      passwordHash: prepared.passwordHash,
      totpEnabled: true,
      totpSecretEncrypted: prepared.totpSecretEncrypted,
      active: true,
      setupCompletedAt: new Date(),
      sessionVersion: { increment: 1 }
    },
    select: { id: true, sessionVersion: true }
  });
  await tx.adminSetupToken.updateMany({
    where: { adminUserId: account.id, usedAt: null },
    data: { usedAt: new Date() }
  });
  const metadata = { reason: prepared.reason, actor: "ops-cli" };
  await tx.auditLog.create({
    data: {
      adminId: account.id,
      action: ADMIN_BREAK_GLASS_ACTION,
      targetType: "AdminUser",
      targetId: account.id,
      metadataJson: metadata
    }
  });
  await tx.operationalEvent.create({
    data: {
      eventType: ADMIN_BREAK_GLASS_ACTION,
      actorType: "ops",
      entityType: "AdminUser",
      entityId: account.id,
      metadataJson: metadata
    }
  });
  return {
    mode: "apply",
    adminId: updated.id,
    email: account.email,
    sessionVersion: updated.sessionVersion,
    otpauthUri: prepared.otpauthUri,
    manualKey: prepared.manualKey
  };
}
