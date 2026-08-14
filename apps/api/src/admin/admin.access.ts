import { AdminRole } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import type { Principal } from "../security/security.js";

export type AdminPrincipal = Extract<Principal, { kind: "admin" }>;

export function editorScope(admin: AdminPrincipal): { editorId?: string } {
  return admin.role === AdminRole.EDITOR ? { editorId: admin.sub } : {};
}

export function assertEditorOwns<T extends { editorId: string }>(
  drama: T | null,
  admin: AdminPrincipal
): T {
  if (!drama) throw Errors.notFound("Drama");
  if (admin.role === AdminRole.EDITOR && drama.editorId !== admin.sub) {
    throw Errors.forbidden("OWNERSHIP_REQUIRED", "Editors may only access their own dramas");
  }
  return drama;
}

export function assertNotSelfReview(editorId: string, reviewerId: string): void {
  if (editorId === reviewerId) {
    throw Errors.forbidden("SELF_REVIEW_FORBIDDEN", "An editor cannot review their own drama");
  }
}

export function assertNotPublished(status: string): void {
  if (status === "PUBLISHED") {
    throw Errors.conflict(
      "PUBLISHED_DRAMA_IMMUTABLE",
      "Published drama rights or media cannot be replaced; offline it first"
    );
  }
}
