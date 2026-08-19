import { Prisma } from "@prisma/client";
import {
  AdminAccountStatus,
  AdminRole,
  type AdminAccountView
} from "@microfocus/contracts";

export type AdminAccountRow = {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string | null;
  role: string;
  active: boolean;
  setupCompletedAt: Date | null;
  sessionVersion?: number;
  lastLoginAt: Date | null;
  totpEnabled: boolean;
  totpSecretEncrypted?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { editedDramas: number };
};

export const ACCOUNT_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  active: true,
  setupCompletedAt: true,
  lastLoginAt: true,
  totpEnabled: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { editedDramas: true } }
} satisfies Prisma.AdminUserSelect;

export const MUTABLE_ACCOUNT_SELECT = {
  ...ACCOUNT_SELECT,
  passwordHash: true,
  sessionVersion: true,
  totpEnabled: true,
  totpSecretEncrypted: true
} satisfies Prisma.AdminUserSelect;

export function deriveAdminAccountStatus(input: {
  setupCompletedAt: Date | null;
  active: boolean;
}): AdminAccountStatus {
  if (!input.setupCompletedAt) return AdminAccountStatus.PENDING_SETUP;
  return input.active ? AdminAccountStatus.ACTIVE : AdminAccountStatus.SUSPENDED;
}

export function toAdminAccountView(row: AdminAccountRow): AdminAccountView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as AdminRole,
    status: deriveAdminAccountStatus(row),
    totpEnabled: row.totpEnabled,
    ownedDramaCount: row._count.editedDramas,
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
