import {
  API_ROUTES,
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE,
  normalizeSystemNotificationAdminPageSize,
  encodedRoute,
} from "@microfocus/contracts";
import type { AdminNotificationRecord, PageResult } from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeAdminNotificationList } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const notificationsApi = {
  async listNotifications(query = "", status = "", page = 1, pageSize = SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE): Promise<PageResult<AdminNotificationRecord>> {
    const safePageSize = normalizeSystemNotificationAdminPageSize(pageSize);
    if (isMockMode) return mockApi.listNotifications(query, status, page, safePageSize);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    return normalizeAdminNotificationList(await request<unknown>(`${endpoints.notifications}?${params}`));
  },
  async getNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.getNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notification, id))] }).items[0]!;
  },
  async createNotification(title: string, body: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.createNotification(title, body);
    return normalizeAdminNotificationList({ items: [await request<unknown>(endpoints.notifications, { method: "POST", body: json({ title, body }) })] }).items[0]!;
  },
  async updateNotification(id: string, input: { title?: string; body?: string }): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.updateNotification(id, input);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notification, id), { method: "PATCH", body: json(input) })] }).items[0]!;
  },
  async deleteNotification(id: string): Promise<void> {
    if (isMockMode) return mockApi.deleteNotification(id);
    await request(encodedRoute(endpoints.notificationDelete, id), { method: "DELETE" });
  },
  async publishNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.publishNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notificationPublish, id), { method: "POST" })] }).items[0]!;
  },
  async retractNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.retractNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notificationRetract, id), { method: "POST" })] }).items[0]!;
  },
};
