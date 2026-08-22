import {
  SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE,
  normalizeSystemNotificationAdminPageSize,
  SystemNotificationStatus
} from "@microfocus/contracts";
import type {
  PageResult,
  AdminNotificationRecord
} from "@/shared/types";



import {
  MOCK_CURRENT_ADMIN_ID
} from "../fixtures";
import {
  state
} from "../state";
import {
  persistMockContent
} from "../storage";
import {
  mockDelay,
  paginate,
  writeAudit
} from "../helpers";

export const notificationsMockApi = {
  async listNotifications(query = "", status = "", page = 1, pageSize = SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE): Promise<PageResult<AdminNotificationRecord>> {
    const normalized = query.trim().toLowerCase();
    const items = state.mockNotifications.filter((item) => (!status || item.status === status) && (!normalized || `${item.title} ${item.body}`.toLowerCase().includes(normalized)));
    return mockDelay(paginate(items, page, normalizeSystemNotificationAdminPageSize(pageSize)));
  },
  async createNotification(title: string, body: string): Promise<AdminNotificationRecord> {
    const item: AdminNotificationRecord = { id: `notification-${crypto.randomUUID()}`, title: title.trim(), body: body.trim(), status: SystemNotificationStatus.DRAFT, publishedAt: null, createdAt: new Date().toISOString(), createdByAdminId: MOCK_CURRENT_ADMIN_ID, createdByAdminName: "陈管理员" };
    state.mockNotifications.unshift(item);
    writeAudit(state, "SYSTEM_NOTIFICATION_CREATED", item.id, "系统通知草稿");
    return mockDelay(item);
  },
  async getNotification(id: string): Promise<AdminNotificationRecord> {
    const item = state.mockNotifications.find((row) => row.id === id);
    if (!item) throw new Error("未找到通知");
    return mockDelay(item);
  },
  async updateNotification(id: string, input: { title?: string; body?: string }): Promise<AdminNotificationRecord> {
    const item = state.mockNotifications.find((row) => row.id === id);
    if (!item) throw new Error("未找到通知");
    if (item.status !== SystemNotificationStatus.DRAFT) throw new Error("只有草稿通知可以编辑");
    Object.assign(item, input);
    return mockDelay(item);
  },
  async deleteNotification(id: string): Promise<void> {
    const index = state.mockNotifications.findIndex((row) => row.id === id);
    if (index < 0) throw new Error("未找到通知");
    if (state.mockNotifications[index]!.status !== SystemNotificationStatus.DRAFT) throw new Error("只有草稿通知可以删除");
    const [item] = state.mockNotifications.splice(index, 1);
    writeAudit(state, "SYSTEM_NOTIFICATION_DELETED", item!.id, "系统通知草稿");
    persistMockContent(state);
    return mockDelay(undefined);
  },
  async publishNotification(id: string): Promise<AdminNotificationRecord> {
    const item = state.mockNotifications.find((row) => row.id === id);
    if (!item) throw new Error("未找到通知");
    item.status = SystemNotificationStatus.PUBLISHED;
    item.publishedAt = new Date().toISOString();
    writeAudit(state, "SYSTEM_NOTIFICATION_PUBLISHED", item.id, item.title);
    return mockDelay(item);
  },
  async retractNotification(id: string): Promise<AdminNotificationRecord> {
    const item = state.mockNotifications.find((row) => row.id === id);
    if (!item) throw new Error("未找到通知");
    item.status = SystemNotificationStatus.RETRACTED;
    writeAudit(state, "SYSTEM_NOTIFICATION_RETRACTED", item.id, item.title);
    return mockDelay(item);
  },
};
