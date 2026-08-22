import type { AssignableAdminRole } from "@microfocus/contracts";

export type AccountDialogMode = "create" | "edit" | "suspend" | "activate" | "invite" | "reset";

export interface AccountDialogForm {
  displayName: string;
  email: string;
  role: AssignableAdminRole;
  otp: string;
  reason: string;
  replacementEditorId: string;
}
