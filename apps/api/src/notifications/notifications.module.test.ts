import { AdminRole, SystemNotificationStatus, SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE, UserFeedbackStatus } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  AdminNotificationsController,
  UserFeedbackController,
  UserNotificationsController
} from "./notifications.module.js";

vi.mock("../security/rate-limit.js", () => ({
  assertNamedRateLimit: vi.fn().mockResolvedValue(undefined)
}));

const user = { kind: "user" as const, sub: "user-1" };
const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };

describe("user notifications and feedback", () => {
  it("requires the user principal and does not expose internal notes", async () => {
    const prisma = {
      userFeedback: {
        findFirst: vi.fn().mockResolvedValue({
          id: "feedback-1", userId: "user-1", body: "问题", status: UserFeedbackStatus.NEW,
          internalNote: "仅管理员可见", createdAt: new Date(), updatedAt: new Date(), replies: []
        })
      }
    };
    const controller = new UserFeedbackController(prisma as never);
    await expect(controller.detail(user, "feedback-1")).resolves.toMatchObject({
      id: "feedback-1",
      body: "问题",
      status: UserFeedbackStatus.NEW
    });
    await expect(controller.detail({ kind: "admin", sub: "admin-1", role: AdminRole.ADMIN }, "feedback-1"))
      .rejects.toMatchObject({ code: "USER_TOKEN_REQUIRED" });
    expect((await controller.detail(user, "feedback-1")) as Record<string, unknown>).not.toHaveProperty("internalNote");
  });

  it("creates feedback and records a user operational event", async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        userFeedback: { create: vi.fn().mockResolvedValue({ id: "feedback-1", body: "建议", status: UserFeedbackStatus.NEW, createdAt: new Date(), updatedAt: new Date(), replies: [] }) },
        operationalEvent: { create: vi.fn().mockResolvedValue({}) }
      }))
    };
    const result = await new UserFeedbackController(prisma as never).create(user, { body: " 建议 " });
    expect(result).toMatchObject({ id: "feedback-1", body: "建议" });
  });

  it("marks a published notification read only for its owner", async () => {
    const prisma = {
      systemNotification: {
        findFirst: vi.fn().mockResolvedValue({ id: "notice-1" })
      },
      notificationRead: { upsert: vi.fn().mockResolvedValue({}) }
    };
    await expect(new UserNotificationsController(prisma as never).markRead(user, "notice-1")).resolves.toMatchObject({ id: "notice-1" });
    expect(prisma.notificationRead.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { notificationId_userId: { notificationId: "notice-1", userId: "user-1" } } }));
  });
});

describe("admin notifications and feedback", () => {
  it("returns the notification publisher name in list and detail responses", async () => {
    const row = {
      id: "notice-1", title: "标题", body: "完整正文", status: SystemNotificationStatus.PUBLISHED,
      createdByAdminId: "admin-1", createdByAdmin: { displayName: "陈管理员" }, publishedAt: new Date(), createdAt: new Date()
    };
    const prisma = {
      systemNotification: {
        findMany: vi.fn().mockResolvedValue([row]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(row)
      }
    };
    const controller = new AdminNotificationsController(prisma as never);
    await expect(controller.listNotifications()).resolves.toMatchObject({ items: [{ createdByAdminName: "陈管理员" }] });
    expect(prisma.systemNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE }));
    await expect(controller.getNotification("notice-1")).resolves.toMatchObject({ body: "完整正文", createdByAdminName: "陈管理员" });
  });

  it("returns not found for a missing notification detail", async () => {
    const prisma = { systemNotification: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(new AdminNotificationsController(prisma as never).getNotification("missing"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("publishes only drafts and audits the state transition", async () => {
    const current = { id: "notice-1", status: SystemNotificationStatus.DRAFT, title: "标题", body: "正文", createdByAdminId: "admin-1", publishedAt: null, createdAt: new Date() };
    const prisma = {
      systemNotification: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({ ...current, status: SystemNotificationStatus.PUBLISHED, publishedAt: new Date() })
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(new AdminNotificationsController(prisma as never).publishNotification(admin, "notice-1")).resolves.toMatchObject({ status: SystemNotificationStatus.PUBLISHED });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SYSTEM_NOTIFICATION_PUBLISHED", targetId: "notice-1" }) }));
  });

  it("deletes only draft notifications and preserves an audit trail", async () => {
    const prisma = {
      systemNotification: {
        findUnique: vi.fn().mockResolvedValue({ id: "notice-1", status: SystemNotificationStatus.DRAFT }),
        delete: vi.fn().mockResolvedValue({})
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(new AdminNotificationsController(prisma as never).deleteNotification(admin, "notice-1"))
      .resolves.toEqual({ id: "notice-1", deleted: true });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "SYSTEM_NOTIFICATION_DELETED", targetId: "notice-1" }) }));
  });

  it("replies in one transaction and creates a user notification", async () => {
    const tx = {
      feedbackReply: { create: vi.fn().mockResolvedValue({ id: "reply-1", body: "已处理", createdAt: new Date() }) },
      userNotification: { create: vi.fn().mockResolvedValue({}) },
      userFeedback: { update: vi.fn().mockResolvedValue({}) }
    };
    const prisma = {
      userFeedback: { findUnique: vi.fn().mockResolvedValue({ id: "feedback-1", userId: "user-1" }) },
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
      auditLog: { create: vi.fn().mockResolvedValue({}) }
    };
    await expect(new AdminNotificationsController(prisma as never).reply(admin, "feedback-1", { body: "已处理" })).resolves.toMatchObject({ id: "reply-1" });
    expect(tx.userNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user-1", sourceType: "FEEDBACK_REPLY", sourceId: "feedback-1" }) });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "FEEDBACK_REPLIED" }) }));
  });
});
