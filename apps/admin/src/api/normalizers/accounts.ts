import {
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose
} from "@microfocus/contracts";
import type {
  AdminAccountRecord,
  AdminSetupLink,
  PageResult
} from "@/shared/types";

import {
  record,
  text,
  finiteNumber,
  dateText,
  enumValue,
  collection
} from "./primitives";

export function normalizeAdminAccount(value: unknown): AdminAccountRecord {
  const source = record(value);
  const id = text(source.id);
  const displayName = text(source.displayName);
  const email = text(source.email).toLowerCase();
  const role = enumValue(source.role, Object.values(AdminRole), "" as AdminRole);
  const status = enumValue(
    source.status,
    Object.values(AdminAccountStatus),
    AdminAccountStatus.PENDING_SETUP,
  );
  if (!id || !displayName || !email || !role) {
    throw new Error("账号列表响应缺少必要字段");
  }
  return {
    id,
    displayName,
    email,
    role,
    status,
    totpEnabled: source.totpEnabled === true,
    ownedDramaCount: Math.max(0, Math.round(finiteNumber(source.ownedDramaCount))),
    setupCompletedAt: dateText(source.setupCompletedAt) || null,
    lastLoginAt: dateText(source.lastLoginAt) || null,
    createdAt: dateText(source.createdAt),
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeAdminAccountList(value: unknown): PageResult<AdminAccountRecord> {
  const source = record(value);
  const items = collection(value).map(normalizeAdminAccount);
  const returnedTotal = finiteNumber(source.total);
  return { items, total: returnedTotal >= 0 ? Math.round(returnedTotal) : items.length };
}

export function normalizeAdminSetupLink(value: unknown): AdminSetupLink {
  const source = record(value);
  const setupUrl = text(source.setupUrl);
  const expiresAt = dateText(source.expiresAt);
  const purpose = enumValue(
    source.purpose,
    Object.values(AdminSetupPurpose),
    AdminSetupPurpose.INVITE,
  );
  const setupToken = text(source.setupToken);
  const account = normalizeAdminAccount(source.account);
  if (!setupUrl || !setupToken || !expiresAt) throw new Error("开通链接响应不完整，请重试");
  return { account, setupUrl, setupToken, expiresAt, purpose };
}
