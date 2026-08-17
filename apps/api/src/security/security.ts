import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  Optional,
  SetMetadata
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { AdminRole, ERROR_CODES } from "@microfocus/contracts";
import { AppError, Errors } from "../common/app-error.js";
import { requireBearerToken } from "../common/header-limits.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type Principal =
  | { kind: "user"; sub: string }
  | { kind: "viewer"; sub: string; deviceId: string }
  | { kind: "admin"; sub: string; role: AdminRole };

export type AuthenticatedRequest = {
  header(name: string): string | undefined;
  principal?: Principal;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = requireBearerToken(request.header("authorization"));
    try {
      const principal = parsePrincipal(await this.jwt.verifyAsync(token));
      if (principal.kind === "user" && this.prisma) {
        const user = await this.prisma.user.findUnique({
          where: { id: principal.sub },
          select: { status: true }
        });
        if (!user || user.status !== "ACTIVE") {
          throw Errors.unauthorized(
            "This account is unavailable",
            ERROR_CODES.ACCOUNT_UNAVAILABLE
          );
        }
      }
      request.principal = principal;
      return true;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isTokenExpiredError(error) && decodeKind(this.jwt, token) === "viewer") {
        throw Errors.unauthorized(
          "Anonymous viewer session expired",
          ERROR_CODES.ANONYMOUS_SESSION_EXPIRED
        );
      }
      throw Errors.unauthorized("Invalid or expired access token");
    }
  }
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtAuth: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    if (!authorization) return true;
    return this.jwtAuth.canActivate(context);
  }
}

const ROLES = Symbol("roles");
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES, roles);

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES, [
      context.getHandler(),
      context.getClass()
    ]);
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (principal?.kind !== "admin") throw Errors.forbidden();
    if (required?.length && !required.includes(principal.role)) {
      throw Errors.forbidden("INSUFFICIENT_ROLE", "Administrator role is insufficient");
    }
    return true;
  }
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw Errors.unauthorized();
    return principal;
  }
);

export const OptionalPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal | undefined => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  }
);

export function parsePrincipal(payload: unknown): Principal {
  if (!payload || typeof payload !== "object") {
    throw Errors.unauthorized("Invalid or expired access token");
  }
  const record = payload as Record<string, unknown>;
  const sub = typeof record.sub === "string" ? record.sub : "";
  if (!sub) throw Errors.unauthorized("Invalid or expired access token");
  if (record.kind === "user") return { kind: "user", sub };
  if (record.kind === "viewer") {
    const deviceId = typeof record.deviceId === "string" ? record.deviceId : "";
    if (!deviceId) throw Errors.unauthorized("Invalid or expired access token");
    return { kind: "viewer", sub, deviceId };
  }
  if (record.kind === "admin") {
    const role = record.role;
    if (role !== AdminRole.ADMIN && role !== AdminRole.EDITOR && role !== AdminRole.REVIEWER) {
      throw Errors.unauthorized("Invalid or expired access token");
    }
    return { kind: "admin", sub, role };
  }
  throw Errors.unauthorized("Invalid or expired access token");
}

function isTokenExpiredError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "TokenExpiredError"
  );
}

function decodeKind(jwt: JwtService, token: string): string | undefined {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return undefined;
  const kind = (decoded as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}
