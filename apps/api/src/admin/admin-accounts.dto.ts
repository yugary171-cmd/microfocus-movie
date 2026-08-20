import {
  ADMIN_DISPLAY_NAME_MAX_LENGTH,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  ADMIN_SETUP_PASSWORD_MIN_LENGTH,
  ADMIN_SETUP_TOKEN_MAX_LENGTH,
  ADMIN_LOGIN_ID_MAX_LENGTH,
  ADMIN_LOGIN_ID_PATTERN,
  ASSIGNABLE_ADMIN_ROLES,
  ENTITY_ID_MAX_LENGTH,
  OTP_INPUT_LENGTH,
  PASSWORD_MAX_LENGTH,
  AdminSetupPurpose,
  type AssignableAdminRole,
  type AdminAccountSensitiveActionRequest,
  type CompleteAdminSetupRequest,
  type CreateAdminAccountRequest,
  type CreateAdminSetupLinkRequest,
  type InspectAdminSetupRequest,
  type UpdateAdminAccountRequest
} from "@microfocus/contracts";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

const OTP_PATTERN = /^\d{6}$/;

export class CreateAdminAccountDto implements CreateAdminAccountRequest {
  @IsString()
  @Matches(ADMIN_LOGIN_ID_PATTERN)
  @MaxLength(ADMIN_LOGIN_ID_MAX_LENGTH)
  email!: string;

  @IsString()
  @Length(1, ADMIN_DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;

  @IsIn([...ASSIGNABLE_ADMIN_ROLES])
  role!: AssignableAdminRole;

  @IsString()
  @Length(OTP_INPUT_LENGTH, OTP_INPUT_LENGTH)
  @Matches(OTP_PATTERN)
  otp!: string;

  @IsString()
  @Length(ADMIN_REASON_MIN_LENGTH, ADMIN_REASON_MAX_LENGTH)
  reason!: string;
}

export class UpdateAdminAccountDto implements UpdateAdminAccountRequest {
  @IsOptional()
  @IsString()
  @Length(1, ADMIN_DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;

  @IsOptional()
  @IsIn([...ASSIGNABLE_ADMIN_ROLES])
  role?: AssignableAdminRole;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  transferEditorId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  replacementEditorId?: string;

  @IsString()
  @Length(OTP_INPUT_LENGTH, OTP_INPUT_LENGTH)
  @Matches(OTP_PATTERN)
  otp!: string;

  @IsString()
  @Length(ADMIN_REASON_MIN_LENGTH, ADMIN_REASON_MAX_LENGTH)
  reason!: string;
}

export class AdminAccountSensitiveActionDto
  implements AdminAccountSensitiveActionRequest
{
  @IsString()
  @Length(OTP_INPUT_LENGTH, OTP_INPUT_LENGTH)
  @Matches(OTP_PATTERN)
  otp!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  transferEditorId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  replacementEditorId?: string;

  @IsString()
  @Length(ADMIN_REASON_MIN_LENGTH, ADMIN_REASON_MAX_LENGTH)
  reason!: string;
}

export class CreateAdminSetupLinkDto
  extends AdminAccountSensitiveActionDto
  implements CreateAdminSetupLinkRequest
{
  @IsEnum(AdminSetupPurpose)
  purpose!: AdminSetupPurpose;
}

export class InspectAdminSetupDto implements InspectAdminSetupRequest {
  @IsString()
  @Length(32, ADMIN_SETUP_TOKEN_MAX_LENGTH)
  token!: string;
}

export class CompleteAdminSetupDto implements CompleteAdminSetupRequest {
  @IsString()
  @Length(32, ADMIN_SETUP_TOKEN_MAX_LENGTH)
  token!: string;

  @IsString()
  @Length(ADMIN_SETUP_PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;

  @IsString()
  @Length(OTP_INPUT_LENGTH, OTP_INPUT_LENGTH)
  @Matches(OTP_PATTERN)
  otp!: string;
}
