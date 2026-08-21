import { Body, Controller, HttpCode, HttpStatus, Module, Post, Req, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ANONYMOUS_VIEWER_TTL_SECONDS,
  API_ROUTES,
  ADMIN_LOGIN_ID_MAX_LENGTH,
  ADMIN_LOGIN_ID_PATTERN,
  DEVICE_ID_MAX_LENGTH,
  ERROR_CODES,
  OTP_INPUT_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_ID_MAX_LENGTH,
  WECHAT_CODE_MAX_LENGTH,
  AdminRole,
  type AdminLoginResponse,
  type AnonymousSessionResponse,
  type WechatLoginResponse
} from "@microfocus/contracts";
import { IsString, Length, Matches, MaxLength, MinLength } from "class-validator";
import { compare } from "bcryptjs";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { WechatProviderService } from "../providers/providers.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";
import { TotpService } from "../security/totp.service.js";
import { toProfile } from "../profile/profile.module.js";
import {
  ADMIN_REFRESH_COOKIE_NAME,
  AdminSessionService,
  clearRefreshCookie,
  readCookie,
  refreshCookie,
  type CookieResponse
} from "./admin-session.js";

export class WechatLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(WECHAT_CODE_MAX_LENGTH)
  code!: string;
}

export class AnonymousSessionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(DEVICE_ID_MAX_LENGTH)
  deviceId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(SESSION_ID_MAX_LENGTH)
  sessionId!: string;
}

export class AdminLoginDto {
  @IsString()
  @Matches(ADMIN_LOGIN_ID_PATTERN)
  @MaxLength(ADMIN_LOGIN_ID_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsString()
  @Length(OTP_INPUT_LENGTH, OTP_INPUT_LENGTH)
  @Matches(/^\d{6}$/)
  otp!: string;
}

type AdminAuthRequest = SocketRequest & { header(name: string): string | undefined };

@Controller()
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wechat: WechatProviderService,
    private readonly totp: TotpService,
    private readonly sessions: AdminSessionService
  ) {}

  @Post(controllerPath(API_ROUTES.auth.wechat))
  async wechatLogin(
    @Req() request: SocketRequest,
    @Body() body: WechatLoginDto
  ): Promise<WechatLoginResponse> {
    await assertNamedRateLimit(this.prisma, "wechatLogin", requestIpKey(request));
    const identity = await this.wechat.exchangeCode(body.code);
    const existing = await this.prisma.user.findUnique({ where: { openId: identity.openId } });
    if (existing && existing.status !== "ACTIVE") {
      throw Errors.unauthorized("This account is unavailable", ERROR_CODES.ACCOUNT_UNAVAILABLE);
    }
    const user =
      existing ??
      (await this.prisma.user.create({
        data: { openId: identity.openId, displayName: "微信用户" }
      }));
    return {
      accessToken: await this.jwt.signAsync(
        { sub: user.id, kind: "user" },
        { expiresIn: "2h" }
      ),
      user: toProfile(user)
    };
  }

  @Post(controllerPath(API_ROUTES.auth.anonymous))
  async anonymousSession(
    @Req() request: SocketRequest,
    @Body() body: AnonymousSessionDto
  ): Promise<AnonymousSessionResponse> {
    const deviceId = body.deviceId.trim().slice(0, DEVICE_ID_MAX_LENGTH);
    const sessionId = body.sessionId.trim().slice(0, SESSION_ID_MAX_LENGTH);
    const now = new Date();
    const existing = await this.prisma.anonymousViewerSession.findUnique({
      where: { deviceId_sessionId: { deviceId, sessionId } }
    });
    if (!existing) {
      await assertNamedRateLimit(this.prisma, "anonymousSession", requestIpKey(request));
    }
    const expiresAt = new Date(now.getTime() + ANONYMOUS_VIEWER_TTL_SECONDS * 1000);
    const session = await this.prisma.anonymousViewerSession.upsert({
      where: { deviceId_sessionId: { deviceId, sessionId } },
      create: { deviceId, sessionId, expiresAt, lastIssuedAt: now },
      update: { expiresAt, lastIssuedAt: now }
    });
    return {
      accessToken: await this.jwt.signAsync(
        { sub: session.id, kind: "viewer", deviceId },
        { expiresIn: ANONYMOUS_VIEWER_TTL_SECONDS }
      ),
      expiresAt: expiresAt.toISOString(),
      tokenKind: "viewer"
    };
  }

  @Post(controllerPath(API_ROUTES.admin.login))
  async adminLogin(
    @Req() request: SocketRequest,
    @Body() body: AdminLoginDto,
    @Res({ passthrough: true }) response: CookieResponse
  ): Promise<AdminLoginResponse> {
    const email = body.email.trim().toLowerCase();
    await assertNamedRateLimit(
      this.prisma,
      "adminLogin",
      `${requestIpKey(request)}:${email}`
    );
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const passwordValid = admin?.passwordHash
      ? await compare(body.password, admin.passwordHash)
      : false;
    if (!admin?.active || !admin.setupCompletedAt || !passwordValid) {
      throw Errors.unauthorized("Invalid administrator credentials");
    }
    if (!this.totp.verifyAdminOtp(admin, body.otp)) {
      throw Errors.unauthorized("Invalid administrator one-time password");
    }
    const updated = await this.prisma.adminUser.updateMany({
      where: {
        id: admin.id,
        active: true,
        setupCompletedAt: { not: null },
        role: admin.role,
        sessionVersion: admin.sessionVersion
      },
      data: { lastLoginAt: new Date() }
    });
    if (updated.count !== 1) {
      throw Errors.unauthorized("Administrator account changed during login");
    }
    const issued = await this.sessions.issue({
        id: admin.id,
        email: admin.email,
        displayName: admin.displayName,
        role: admin.role as AdminRole,
        active: admin.active,
        setupCompletedAt: admin.setupCompletedAt,
        sessionVersion: admin.sessionVersion
      });
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Set-Cookie",
      refreshCookie(issued.refreshToken, {
        ...this.sessions.cookieOptions(),
        maxAgeSeconds: this.sessions.refreshTtlSeconds()
      })
    );
    return issued.response;
  }

  @Post(controllerPath(API_ROUTES.admin.refresh))
  @HttpCode(HttpStatus.OK)
  async adminRefresh(
    @Req() request: AdminAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ): Promise<AdminLoginResponse> {
    this.sessions.assertTrustedOrigin(request);
    await assertNamedRateLimit(this.prisma, "adminRefresh", requestIpKey(request));
    response.setHeader("Cache-Control", "no-store");
    const refreshToken = readCookie(request, ADMIN_REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      response.setHeader("Set-Cookie", clearRefreshCookie(this.sessions.cookieOptions()));
      throw Errors.unauthorized(
        "Administrator refresh session is invalid",
        ERROR_CODES.ADMIN_REFRESH_INVALID
      );
    }
    try {
      const issued = await this.sessions.rotate(refreshToken);
      response.setHeader(
        "Set-Cookie",
        refreshCookie(issued.refreshToken, {
          ...this.sessions.cookieOptions(),
          maxAgeSeconds: this.sessions.refreshTtlSeconds()
        })
      );
      return issued.response;
    } catch (error) {
      response.setHeader("Set-Cookie", clearRefreshCookie(this.sessions.cookieOptions()));
      throw error;
    }
  }

  @Post(controllerPath(API_ROUTES.admin.logout))
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminLogout(
    @Req() request: AdminAuthRequest,
    @Res({ passthrough: true }) response: CookieResponse
  ): Promise<void> {
    this.sessions.assertTrustedOrigin(request);
    response.setHeader("Cache-Control", "no-store");
    const refreshToken = readCookie(request, ADMIN_REFRESH_COOKIE_NAME);
    if (refreshToken) await this.sessions.revoke(refreshToken);
    response.setHeader("Set-Cookie", clearRefreshCookie(this.sessions.cookieOptions()));
  }
}

@Module({ controllers: [AuthController], providers: [AdminSessionService] })
export class AuthModule {}
