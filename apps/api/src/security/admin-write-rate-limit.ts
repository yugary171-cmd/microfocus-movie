import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { RATE_LIMIT_CLIENT_KEY_MAX_LENGTH } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertNamedRateLimit } from "./rate-limit.js";
import type { AuthenticatedRequest } from "./security.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_METHODS = new Set(["GET", "HEAD"]);

export function isAdminWriteMethod(method: string | undefined): boolean {
  return WRITE_METHODS.has((method ?? "GET").toUpperCase());
}

export function isAdminReadMethod(method: string | undefined): boolean {
  return READ_METHODS.has((method ?? "").toUpperCase());
}

export function adminWriteRateLimitKey(adminId: string): string {
  return `admin:${adminId.slice(0, RATE_LIMIT_CLIENT_KEY_MAX_LENGTH)}`;
}

type AdminWriteRequest = AuthenticatedRequest & { method?: string };

@Injectable()
export class AdminWriteRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminWriteRequest>();
    const policy = isAdminWriteMethod(request.method)
      ? "adminWrite"
      : isAdminReadMethod(request.method)
        ? "adminRead"
        : null;
    if (!policy) return true;
    const principal = request.principal;
    if (principal?.kind !== "admin") throw Errors.forbidden();
    await assertNamedRateLimit(this.prisma, policy, adminWriteRateLimitKey(principal.sub));
    return true;
  }
}
