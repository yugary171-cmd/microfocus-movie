import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PROFILE_GENDERS,
  SIGNATURE_MAX_LENGTH,
  isProfileGender,
  type AuthenticatedUser,
  type ProfileGender,
  type UpdateUserProfileRequest
} from "@microfocus/contracts";

export const NICKNAME_MIN_LENGTH = DISPLAY_NAME_MIN_LENGTH;
export const NICKNAME_MAX_LENGTH = DISPLAY_NAME_MAX_LENGTH;
export { SIGNATURE_MAX_LENGTH, type ProfileGender };

export const GENDER_OPTIONS = [
  { id: "male", label: "男" },
  { id: "female", label: "女" },
  { id: "unset", label: "暂不设置" }
] as const satisfies ReadonlyArray<{ id: (typeof PROFILE_GENDERS)[number]; label: string }>;

export function formatMicrofocusId(userId: string): string {
  return userId.trim().slice(0, 12).toUpperCase();
}

export function clipNicknameInput(value: string): string {
  return Array.from(value).slice(0, NICKNAME_MAX_LENGTH).join("");
}

export function boundNickname(value: string): string {
  return clipNicknameInput(value).trim();
}

export function boundSignature(value: string): string {
  return Array.from(value).slice(0, SIGNATURE_MAX_LENGTH).join("");
}

export function canSaveNickname(original: string, next: string): boolean {
  const nickname = boundNickname(next);
  const length = Array.from(nickname).length;
  return length >= NICKNAME_MIN_LENGTH && length <= NICKNAME_MAX_LENGTH && nickname !== original.trim();
}

export function genderLabel(gender: ProfileGender): string {
  return GENDER_OPTIONS.find((option) => option.id === gender)?.label ?? "请选择性别";
}

export function genderDisplayLabel(gender: ProfileGender): string {
  return gender === "unset" ? "请选择性别" : genderLabel(gender);
}

export function canSaveSignature(original: string, next: string): boolean {
  return boundSignature(next) !== boundSignature(original);
}

export function applyProfilePatch(
  current: AuthenticatedUser,
  input: UpdateUserProfileRequest
): AuthenticatedUser {
  const next = { ...current };
  if (input.displayName !== undefined) {
    const displayName = boundNickname(input.displayName);
    if (!displayName) throw new Error("昵称请填写1-10个字符");
    next.displayName = displayName;
  }
  if (input.signature !== undefined) next.signature = boundSignature(input.signature);
  if (input.gender !== undefined) {
    if (!isProfileGender(input.gender)) throw new Error("请选择性别");
    next.gender = input.gender;
  }
  if (input.avatarUrl !== undefined) next.avatarUrl = input.avatarUrl?.trim() || null;
  return next;
}
