import {
  AdminRole,
  AdminSetupPurpose
} from "@microfocus/contracts";
import type {
  AdminSession,
  AdminAccountSetupInfo
} from "@/shared/types";

import {
  record,
  text,
  dateText,
  enumValue
} from "./primitives";

export function normalizeAdminSession(value: unknown): AdminSession {
  const source = record(value);
  const admin = record(source.admin);
  const accessToken = text(source.accessToken);
  const accessTokenExpiresAt = dateText(source.accessTokenExpiresAt);
  const id = text(admin.id);
  const email = text(admin.email);
  const role = enumValue(admin.role, Object.values(AdminRole), "" as AdminRole);
  if (!accessToken || !accessTokenExpiresAt || !id || !email || !role) {
    throw new Error("登录响应缺少有效的管理员会话信息");
  }
  return {
    accessToken,
    accessTokenExpiresAt,
    user: {
      id,
      email,
      name: text(admin.displayName) || email,
      role,
    },
  };
}

export function normalizeAdminAccountSetupInfo(value: unknown): AdminAccountSetupInfo {
  const source = record(value);
  const displayName = text(source.displayName);
  const email = text(source.email).toLowerCase();
  const role = enumValue(source.role, Object.values(AdminRole), "" as AdminRole);
  const purpose = enumValue(
    source.purpose,
    Object.values(AdminSetupPurpose),
    AdminSetupPurpose.INVITE,
  );
  const otpauthUri = text(source.otpauthUri);
  const manualKey = text(source.manualKey);
  const expiresAt = dateText(source.expiresAt);
  if (!displayName || !email || !role || !otpauthUri || !manualKey || !expiresAt) {
    throw new Error("开通信息响应不完整，请重新获取链接");
  }
  return { displayName, email, role, purpose, otpauthUri, manualKey, expiresAt };
}
