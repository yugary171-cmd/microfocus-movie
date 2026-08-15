import { normalizeAuthenticatedUser, type AuthenticatedUser } from "@microfocus/contracts";

let mockProfile: AuthenticatedUser | null = null;

export function readMockProfile(): AuthenticatedUser | null {
  return mockProfile ? { ...mockProfile } : null;
}

export function resetMockProfile(): void {
  mockProfile = null;
}

export function writeMockProfile(user: AuthenticatedUser): AuthenticatedUser {
  const next = normalizeAuthenticatedUser(user);
  if (!next) throw new Error("请先登录");
  mockProfile = next;
  return { ...mockProfile };
}

export function syncMockProfile(user: AuthenticatedUser): AuthenticatedUser {
  const next = normalizeAuthenticatedUser(user);
  if (!next) throw new Error("请先登录");
  if (!mockProfile || mockProfile.id !== next.id) {
    mockProfile = next;
    return { ...mockProfile };
  }
  mockProfile = {
    ...mockProfile,
    displayName: next.displayName || mockProfile.displayName,
    avatarUrl: next.avatarUrl ?? mockProfile.avatarUrl
  };
  return { ...mockProfile };
}

export function requireMockProfile(): AuthenticatedUser {
  if (!mockProfile) throw new Error("请先登录");
  return mockProfile;
}
