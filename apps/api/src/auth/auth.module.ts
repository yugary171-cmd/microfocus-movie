import { Body, Controller, Module, Post, Req } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ANONYMOUS_VIEWER_TTL_SECONDS,
  API_ROUTES,
  DEVICE_ID_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  ERROR_CODES,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SESSION_ID_MAX_LENGTH,
  WECHAT_CODE_MAX_LENGTH,
  type AnonymousSessionResponse,
  type WechatLoginResponse
} from "@microfocus/contracts";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { compare } from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { WechatProviderService } from "../providers/providers.js";
import { AppConfigService } from "../config/config.service.js";
import { tryDecryptTotpSecret } from "../security/totp-crypto.js";
import { decodeTotpSecretBase32 } from "../security/totp-secret.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";
import { toProfile } from "../profile/profile.module.js";

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
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsString()
  @MinLength(OTP_MIN_LENGTH)
  @MaxLength(OTP_MAX_LENGTH)
  otp!: string;
}

@Controller()
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wechat: WechatProviderService,
    private readonly config: AppConfigService
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
  async adminLogin(@Req() request: SocketRequest, @Body() body: AdminLoginDto) {
    await assertNamedRateLimit(
      this.prisma,
      "adminLogin",
      `${requestIpKey(request)}:${body.email.trim().toLowerCase()}`
    );
    const admin = await this.prisma.adminUser.findUnique({ where: { email: body.email } });
    if (!admin?.active || !(await compare(body.password, admin.passwordHash))) {
      throw Errors.unauthorized("Invalid administrator credentials");
    }
    if (!this.verifyOtp(admin.totpEnabled, admin.totpSecretEncrypted, body.otp)) {
      throw Errors.unauthorized("Invalid administrator one-time password");
    }
    return {
      accessToken: await this.jwt.signAsync(
        { sub: admin.id, kind: "admin", role: admin.role },
        { expiresIn: "1h" }
      ),
      admin: { id: admin.id, email: admin.email, role: admin.role }
    };
  }

  private verifyOtp(enabled: boolean, encryptedSecret: string | null, otp: string): boolean {
    if (this.config.env.NODE_ENV !== "production" && this.config.env.ADMIN_TEST_OTP) {
      return otp === this.config.env.ADMIN_TEST_OTP;
    }
    if (!enabled || !encryptedSecret) return false;
    if (encryptedSecret.startsWith("plain:")) {
      if (this.config.env.NODE_ENV === "production") return false;
      return verifyTotp(encryptedSecret.slice(6), otp);
    }
    const key = this.config.env.TOTP_ENCRYPTION_KEY;
    if (!key) throw Errors.providerNotConfigured("administrator TOTP decryption");
    const decrypted = tryDecryptTotpSecret(encryptedSecret, {
      current: key,
      ...(this.config.env.TOTP_ENCRYPTION_KEY_PREVIOUS
        ? { previous: this.config.env.TOTP_ENCRYPTION_KEY_PREVIOUS }
        : {})
    });
    if (!decrypted) return false;
    try {
      return verifyTotp(decrypted.secret, otp);
    } catch {
      return false;
    }
  }
}

function verifyTotp(base32Secret: string, token: string, now = Date.now()): boolean {
  const secret = decodeTotpSecretBase32(base32Secret);
  for (const offset of [-1, 0, 1]) {
    const counter = Math.floor(now / 30_000) + offset;
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", secret).update(buffer).digest();
    const position = (digest[digest.length - 1] ?? 0) & 0x0f;
    const binary = ((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000)
      .toString()
      .padStart(6, "0");
    if (
      binary.length === token.length &&
      timingSafeEqual(Buffer.from(binary), Buffer.from(token))
    ) {
      return true;
    }
  }
  return false;
}

@Module({ controllers: [AuthController] })
export class AuthModule {}
