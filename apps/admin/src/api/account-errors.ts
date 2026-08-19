import { ERROR_CODES } from "@microfocus/contracts";

const ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.ADMIN_EMAIL_ALREADY_EXISTS]: "该登录名已被使用",
  [ERROR_CODES.ADMIN_SELF_ACTION_FORBIDDEN]: "不能对自己的账号执行此操作",
  [ERROR_CODES.LAST_ACTIVE_ADMIN]: "必须至少保留一个正常的系统管理员",
  [ERROR_CODES.EDITOR_TRANSFER_REQUIRED]: "该内容编辑名下仍有剧目，请选择接替编辑",
  [ERROR_CODES.EDITOR_TRANSFER_INVALID]: "接替人必须是另一名已开通且正常的内容编辑",
  [ERROR_CODES.ADMIN_OTP_INVALID]: "当前管理员验证码不正确",
  [ERROR_CODES.ADMIN_ACCOUNT_PENDING_SETUP]: "待开通账号必须先完成开通",
  [ERROR_CODES.ADMIN_SETUP_NOT_PENDING]: "该账号当前不能执行此开通操作",
  [ERROR_CODES.INVALID_ADMIN_REASON]: "操作原因长度不符合要求",
  [ERROR_CODES.INVALID_ADMIN_DISPLAY_NAME]: "真实姓名无效",
  [ERROR_CODES.INVALID_ADMIN_EMAIL]: "登录名无效",
  [ERROR_CODES.RATE_LIMITED]: "操作过于频繁，请稍后再试",
};

const SESSION_INVALID_CODES = new Set([
  "UNAUTHORIZED",
  ERROR_CODES.ADMIN_SESSION_INVALID,
  ERROR_CODES.ADMIN_ACCOUNT_SUSPENDED,
  ERROR_CODES.ADMIN_ACCOUNT_UNAVAILABLE,
  ERROR_CODES.ADMIN_ACCOUNT_PENDING_SETUP,
]);

export function isAdminSessionInvalidCode(code: string): boolean {
  return SESSION_INVALID_CODES.has(code);
}

export function accountManagementMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return ACCOUNT_ERROR_MESSAGES[code] ?? "";
}
