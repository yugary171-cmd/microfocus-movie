import { ERROR_CODES } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { WechatProvider } from "../providers/providers.js";

const WECHAT_REAUTH_CODE_MAX_LENGTH = 256;

export function normalizeWechatReauthCode(wechatCode: string | undefined): string {
  const code = wechatCode?.trim() ?? "";
  if (!code || code.length > WECHAT_REAUTH_CODE_MAX_LENGTH) {
    throw Errors.unauthorized(
      "Recent WeChat reauthentication is required",
      ERROR_CODES.REAUTH_REQUIRED
    );
  }
  return code;
}

export async function assertRecentWechatReauth(input: {
  prisma: PrismaService;
  wechat: WechatProvider;
  wechatMode: "mock" | "live";
  userId: string;
  wechatCode: string | undefined;
}): Promise<void> {
  const code = normalizeWechatReauthCode(input.wechatCode);
  const user = await input.prisma.user.findUnique({
    where: { id: input.userId },
    select: { openId: true, status: true }
  });
  if (!user) throw Errors.notFound("User");
  if (user.status !== "ACTIVE" || !user.openId) {
    throw Errors.unauthorized("This account is unavailable", ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }
  const identity = await input.wechat.exchangeCode(code);
  if (identity.openId === user.openId) return;
  // Mock WeChat maps each js_code to a different openId, unlike live
  // code2session. A successful mock exchange still proves a fresh login
  // ceremony; live mode always requires the same WeChat identity.
  if (input.wechatMode === "mock" && user.openId.startsWith("mock:")) return;
  throw Errors.unauthorized(
    "WeChat identity does not match this account",
    ERROR_CODES.REAUTH_MISMATCH
  );
}
