import { Body, Controller, Get, Module, Patch, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  COVER_URL_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  ERROR_CODES,
  PROFILE_GENDERS,
  SIGNATURE_MAX_LENGTH,
  isProfileGender,
  normalizeAuthenticatedUser,
  type AuthenticatedUser,
  type ProfileGender,
  type UpdateUserProfileRequest
} from "@microfocus/contracts";
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";
import { requireUser } from "../history/history.module.js";

export class UpdateProfileDto implements UpdateUserProfileRequest {
  @IsOptional()
  @IsString()
  @MinLength(DISPLAY_NAME_MIN_LENGTH, { message: "昵称请填写1-10个字符" })
  @MaxLength(DISPLAY_NAME_MAX_LENGTH, { message: "昵称请填写1-10个字符" })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SIGNATURE_MAX_LENGTH, { message: "个人签名最多支持100个字符" })
  signature?: string;

  @IsOptional()
  @IsIn([...PROFILE_GENDERS], { message: "请选择性别" })
  gender?: ProfileGender;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(COVER_URL_MAX_LENGTH, { message: "头像地址过长" })
  avatarUrl?: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.profile))
  async getProfile(@CurrentPrincipal() principal: Principal): Promise<AuthenticatedUser> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "profileRead", `user:${userId}`);
    return toProfile(await this.requireProfileUser(userId));
  }

  @Patch(controllerPath(API_ROUTES.profile))
  async updateProfile(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateProfileDto
  ): Promise<AuthenticatedUser> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "profileWrite", `user:${userId}`);
    await this.requireProfileUser(userId);
    const data = profileUpdateData(body);
    if (!data) {
      throw Errors.badRequest("VALIDATION_ERROR", "请至少修改一项资料");
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return toProfile(user);
  }

  private async requireProfileUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Errors.notFound("User");
    return user;
  }
}

export function toProfile(user: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  signature?: string;
  gender?: string;
}): AuthenticatedUser {
  return (
    normalizeAuthenticatedUser({
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      signature: user.signature ?? "",
      gender: isProfileGender(user.gender) ? user.gender : "unset"
    }) ?? {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      signature: "",
      gender: "unset"
    }
  );
}

export function profileUpdateData(body: UpdateUserProfileRequest): {
  displayName?: string;
  signature?: string;
  gender?: ProfileGender;
  avatarUrl?: string | null;
} | null {
  const data: {
    displayName?: string;
    signature?: string;
    gender?: ProfileGender;
    avatarUrl?: string | null;
  } = {};
  if (body.displayName !== undefined) data.displayName = body.displayName.trim();
  if (body.signature !== undefined) data.signature = body.signature.slice(0, SIGNATURE_MAX_LENGTH);
  if (body.gender !== undefined) data.gender = body.gender;
  if (body.avatarUrl !== undefined) {
    const avatarUrl = body.avatarUrl?.trim() || null;
    if (avatarUrl?.includes("\0")) {
      throw Errors.badRequest(ERROR_CODES.INVALID_ENTITY_ID, "头像地址无效");
    }
    data.avatarUrl = avatarUrl;
  }
  return Object.keys(data).length ? data : null;
}

@Module({ controllers: [ProfileController] })
export class ProfileModule {}
