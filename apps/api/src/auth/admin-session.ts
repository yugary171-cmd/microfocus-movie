import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { AdminRole, ERROR_CODES, type AdminLoginResponse } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
import { resolveAdminCorsOrigins } from "../config/cors-origins.js";
import { PrismaService } from "../prisma/prisma.service.js";

export const ADMIN_REFRESH_COOKIE_NAME = "microfocus_admin_refresh";

type CookieRequest = {
  header(name: string): string | undefined;
};

export type CookieResponse = {
  setHeader(name: string, value: string): void;
};

type AdminSessionAccount = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  active: boolean;
  setupCompletedAt: Date | null;
  sessionVersion: number;
};

type IssuedAdminSession = {
  response: AdminLoginResponse;
  refreshToken: string;
};

type SameSite = "lax" | "strict" | "none";

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestOpaqueToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readCookie(request: CookieRequest, name: string): string | null {
  const header = request.header("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function refreshCookie(
  value: string,
  options: { maxAgeSeconds: number; secure: boolean; sameSite: SameSite }
): string {
  const sameSite = options.sameSite[0]!.toUpperCase() + options.sameSite.slice(1);
  return [
    `${ADMIN_REFRESH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/v1/admin/auth",
    "HttpOnly",
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    `Expires=${new Date(Date.now() + Math.max(0, options.maxAgeSeconds) * 1000).toUTCString()}`,
    `SameSite=${sameSite}`,
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

export function clearRefreshCookie(options: {
  secure: boolean;
  sameSite: SameSite;
}): string {
  const sameSite = options.sameSite[0]!.toUpperCase() + options.sameSite.slice(1);
  return [
    `${ADMIN_REFRESH_COOKIE_NAME}=`,
    "Path=/v1/admin/auth",
    "HttpOnly",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `SameSite=${sameSite}`,
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

@Injectable()
export class AdminSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService
  ) {}

  async issue(admin: AdminSessionAccount, now = new Date()): Promise<IssuedAdminSession> {
    const refreshToken = createOpaqueToken();
    const familyId = createOpaqueToken();
    const refreshExpiresAt = new Date(
      now.getTime() + this.config.env.ADMIN_REFRESH_TOKEN_TTL_SECONDS * 1000
    );
    await this.prisma.adminRefreshSession.create({
      data: {
        adminUserId: admin.id,
        familyId,
        tokenDigest: digestOpaqueToken(refreshToken),
        sessionVersion: admin.sessionVersion,
        expiresAt: refreshExpiresAt
      }
    });
    return {
      response: await this.toResponse(admin, now),
      refreshToken
    };
  }

  async rotate(refreshToken: string, now = new Date()): Promise<IssuedAdminSession> {
    const tokenDigest = digestOpaqueToken(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM AdminRefreshSession WHERE tokenDigest = ${tokenDigest} FOR UPDATE`
      );
      const session = await tx.adminRefreshSession.findUnique({
        where: { tokenDigest },
        include: { adminUser: true }
      });
      if (!session) throw this.invalidRefresh();

      if (
        session.revokedAt ||
        session.expiresAt.getTime() <= now.getTime()
      ) {
        await this.revokeFamily(tx, session.familyId, now);
        throw this.invalidRefresh();
      }

      const admin = session.adminUser as AdminSessionAccount;
      if (
        !admin.active ||
        !admin.setupCompletedAt ||
        admin.sessionVersion !== session.sessionVersion
      ) {
        await this.revokeFamily(tx, session.familyId, now);
        throw this.invalidRefresh();
      }

      const nextRefreshToken = createOpaqueToken();
      await tx.adminRefreshSession.update({
        where: { id: session.id },
        data: { revokedAt: now, lastUsedAt: now }
      });
      await tx.adminRefreshSession.create({
        data: {
          adminUserId: admin.id,
          familyId: session.familyId,
          tokenDigest: digestOpaqueToken(nextRefreshToken),
          sessionVersion: admin.sessionVersion,
          expiresAt: session.expiresAt
        }
      });

      return {
        response: await this.toResponse(admin, now),
        refreshToken: nextRefreshToken
      };
    });
  }

  async revoke(refreshToken: string, now = new Date()): Promise<void> {
    await this.prisma.adminRefreshSession.updateMany({
      where: { tokenDigest: digestOpaqueToken(refreshToken), revokedAt: null },
      data: { revokedAt: now, lastUsedAt: now }
    });
  }

  cookieOptions(): { secure: boolean; sameSite: SameSite } {
    return {
      secure: this.config.env.NODE_ENV === "production",
      sameSite: this.config.env.ADMIN_REFRESH_COOKIE_SAME_SITE
    };
  }

  refreshTtlSeconds(): number {
    return this.config.env.ADMIN_REFRESH_TOKEN_TTL_SECONDS;
  }

  assertTrustedOrigin(request: CookieRequest): void {
    const origin = request.header("origin")?.trim();
    if (!origin) return;
    if (!resolveAdminCorsOrigins(this.config.env.ADMIN_ORIGIN, this.config.env.NODE_ENV).includes(origin)) {
      throw Errors.forbidden("FORBIDDEN", "Administrator origin is not allowed");
    }
  }

  private async toResponse(admin: AdminSessionAccount, now: Date): Promise<AdminLoginResponse> {
    const accessTokenExpiresAt = new Date(
      now.getTime() + this.config.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS * 1000
    );
    return {
      accessToken: await this.jwt.signAsync(
        {
          sub: admin.id,
          kind: "admin",
          role: admin.role,
          sessionVersion: admin.sessionVersion
        },
        { expiresIn: this.config.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS }
      ),
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      admin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role
      }
    };
  }

  private invalidRefresh(): ReturnType<typeof Errors.unauthorized> {
    return Errors.unauthorized(
      "Administrator refresh session is invalid",
      ERROR_CODES.ADMIN_REFRESH_INVALID
    );
  }

  private async revokeFamily(
    tx: Prisma.TransactionClient,
    familyId: string,
    now: Date
  ): Promise<void> {
    await tx.adminRefreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now }
    });
  }
}
