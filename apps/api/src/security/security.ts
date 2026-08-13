import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { AdminRole } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";

export type Principal =
  | { kind: "user"; sub: string }
  | { kind: "admin"; sub: string; role: AdminRole };

export type AuthenticatedRequest = {
  header(name: string): string | undefined;
  principal?: Principal;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) throw Errors.unauthorized();
    try {
      request.principal = await this.jwt.verifyAsync<Principal>(authorization.slice(7));
      return true;
    } catch {
      throw Errors.unauthorized("Invalid or expired access token");
    }
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
