import { AdminRole, isOwnedContentRole } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import type { Principal } from "../security/security.js";

export type AdminPrincipal = Extract<Principal, { kind: "admin" }>;

export function editorScope(admin: AdminPrincipal): { editorId?: string } {
  return isOwnedContentRole(admin.role) ? { editorId: admin.sub } : {};
}

export function assertEditorOwns<T extends { editorId: string }>(
  drama: T | null,
  admin: AdminPrincipal
): T {
  if (!drama) throw Errors.notFound("Drama");
  if (isOwnedContentRole(admin.role) && drama.editorId !== admin.sub) {
    throw Errors.forbidden("OWNERSHIP_REQUIRED", "Editors may only access their own dramas");
  }
  return drama;
}

export function assertNotPublished(status: string): void {
  if (status === "PUBLISHED") {
    throw Errors.conflict(
      "PUBLISHED_DRAMA_IMMUTABLE",
      "Published drama rights or media cannot be replaced; offline it first"
    );
  }
}

export function ownedDramaWriteWhere(
  dramaId: string,
  admin: AdminPrincipal
): { id: string; editorId?: string } {
  return isOwnedContentRole(admin.role)
    ? { id: dramaId, editorId: admin.sub }
    : { id: dramaId };
}
