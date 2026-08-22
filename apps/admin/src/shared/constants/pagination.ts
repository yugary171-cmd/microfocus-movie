import {
  ADMIN_LIST_PAGE_SIZE_OPTIONS,
  ADMIN_WEB_PAGE_SIZE,
  DRAMA_ADMIN_PAGE_SIZE,
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE,
  type AdminWebPageSize,
} from "@microfocus/contracts";

export const ADMIN_PAGE_SIZE = ADMIN_WEB_PAGE_SIZE;
export const DRAMA_PAGE_SIZE = DRAMA_ADMIN_PAGE_SIZE;
export const NOTIFICATION_PAGE_SIZE = SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE;
export const ADMIN_PAGE_SIZE_OPTIONS = ADMIN_LIST_PAGE_SIZE_OPTIONS;

export function isAdminPageSize(value: number): value is AdminWebPageSize {
  return ADMIN_PAGE_SIZE_OPTIONS.includes(value as AdminWebPageSize);
}
