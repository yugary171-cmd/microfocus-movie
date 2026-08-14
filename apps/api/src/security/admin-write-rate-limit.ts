import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertNamedRateLimit } from "./rate-limit.js";
import type { AuthenticatedRequest } from "./security.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isAdminWriteMethod(method: string | undefined): boolean {
  return WRITE_METHODS.has((method ?? "GET").toUpperCase());
}

export function adminWriteRateLimitKey(adminId: string): string {
  return `admin:${adminId.slice(0, 64)}`;
}

type AdminWriteRequest = AuthenticatedRequest & { method?: string };

@Injectable()
export class AdminWriteRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminWriteRequest>();
    if (!isAdminWriteMethod(request.method)) return true;
    const principal = request.principal;
    if (principal?.kind !== "admin") throw Errors.forbidden();
    await assertNamedRateLimit(this.prisma, "adminWrite", adminWriteRateLimitKey(principal.sub));
    return true;
  }
}
