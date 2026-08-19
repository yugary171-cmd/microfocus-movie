import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  assertNamedRateLimit,
  requestIpKey,
  type SocketRequest
} from "./rate-limit.js";

type AdminSetupRequest = SocketRequest & {
  method?: string;
  body?: { token?: unknown };
};

export function adminSetupRateLimitKeys(
  request: SocketRequest,
  token: unknown
): { ip: string; token: string } {
  const normalized = typeof token === "string" ? token.trim() : "";
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  return { ip: `ip:${requestIpKey(request)}`, token: `token:${digest}` };
}

@Injectable()
export class AdminSetupRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminSetupRequest>();
    if ((request.method ?? "POST").toUpperCase() === "OPTIONS") return true;
    const keys = adminSetupRateLimitKeys(request, request.body?.token);
    await assertNamedRateLimit(this.prisma, "adminSetup", keys.ip);
    await assertNamedRateLimit(this.prisma, "adminSetup", keys.token);
    return true;
  }
}
