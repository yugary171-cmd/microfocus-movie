import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ADMIN_LIST_MAX_PAGE,
  ADMIN_LIST_PAGE_SIZE,
  API_ROUTES,
  ENTITY_ID_MAX_LENGTH,
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_NOTE_MAX_LENGTH,
  AdminRole,
  SystemNotificationStatus,
  UserFeedbackStatus,
  SYSTEM_NOTIFICATION_BODY_MAX_LENGTH,
  SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH,
  type AdminFeedbackView,
  type AdminNotificationView,
  type NotificationPage,
  type SystemNotificationView,
  type UserFeedbackView,
  type UserNotificationView
} from "@microfocus/contracts";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { controllerPath, currentRequestId, nestedControllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { boundedListWindow, emptyBoundedPage, parsePage } from "../common/list-pagination.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireUser } from "../history/history.module.js";
import {
  AdminRolesGuard,
  CurrentPrincipal,
  JwtAuthGuard,
  Roles,
  type Principal
} from "../security/security.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";
import { AdminWriteRateLimitGuard } from "../security/admin-write-rate-limit.js";

function adminPath(route: string): string {
  return nestedControllerPath(route, API_ROUTES.admin.root);
}

export class CreateSystemNotificationDto {
  @IsString() @MinLength(1) @MaxLength(SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH) title!: string;
  @IsString() @MinLength(1) @MaxLength(SYSTEM_NOTIFICATION_BODY_MAX_LENGTH) body!: string;
}

export class UpdateSystemNotificationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(SYSTEM_NOTIFICATION_TITLE_MAX_LENGTH) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(SYSTEM_NOTIFICATION_BODY_MAX_LENGTH) body?: string;
}

export class CreateFeedbackDto {
  @IsString() @MinLength(1) @MaxLength(FEEDBACK_BODY_MAX_LENGTH) body!: string;
}

export class UpdateFeedbackDto {
  @IsOptional() @IsIn(Object.values(UserFeedbackStatus)) status?: UserFeedbackStatus;
  @IsOptional() @IsString() @MaxLength(FEEDBACK_NOTE_MAX_LENGTH) internalNote?: string;
}

export class FeedbackReplyDto {
  @IsString() @MinLength(1) @MaxLength(FEEDBACK_NOTE_MAX_LENGTH) body!: string;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function auditMetadata(values: Record<string, string | number | null | undefined>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined)) as Record<string, string | number>;
}

async function audit(
  prisma: PrismaService,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | number> = {}
): Promise<void> {
  const requestId = currentRequestId().slice(0, 128);
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      ...(requestId ? { requestId } : {}),
      ...(Object.keys(metadata).length ? { metadataJson: metadata } : {})
    }
  });
}

function systemView(row: {
  id: string; title: string; body: string; status: string;
  publishedAt: Date | null; createdAt: Date; reads?: Array<{ readAt: Date }>;
}): SystemNotificationView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as SystemNotificationStatus,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    ...(row.reads ? { readAt: row.reads[0]?.readAt.toISOString() ?? null } : {})
  };
}

function adminSystemView(row: {
  id: string; title: string; body: string; status: string;
  publishedAt: Date | null; createdAt: Date; createdByAdminId: string;
  createdByAdmin?: { displayName: string } | null;
}): AdminNotificationView {
  return {
    ...systemView(row),
    createdByAdminId: row.createdByAdminId,
    createdByAdminName: row.createdByAdmin?.displayName || "未知管理员"
  };
}

function userNotificationView(row: {
  id: string; title: string; body: string; sourceType: string; sourceId: string | null; createdAt: Date; readAt: Date | null;
}): UserNotificationView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt.toISOString(),
    readAt: iso(row.readAt)
  };
}

function feedbackView(row: {
  id: string; body: string; status: string; internalNote?: string | null;
  createdAt: Date; updatedAt: Date; replies: Array<{ id: string; body: string; createdAt: Date }>;
}, includeInternalNote = true): UserFeedbackView {
  return {
    id: row.id,
    body: row.body,
    status: row.status as UserFeedbackStatus,
    ...(includeInternalNote && row.internalNote !== undefined ? { internalNote: row.internalNote } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    replies: row.replies.map((reply) => ({ id: reply.id, body: reply.body, createdAt: reply.createdAt.toISOString() }))
  };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class UserNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.notifications))
  async notifications(@CurrentPrincipal() principal: Principal, @Query("page") pageValue = "1"): Promise<NotificationPage> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "notificationRead", `user:${userId}`);
    const window = boundedListWindow({ page: parsePage(pageValue), pageSize: 20, maxPage: 100 });
    if (window.exceeded) return { ...emptyBoundedPage(window.page, 20), items: [], hasMore: false, unreadCount: 0 } as NotificationPage;
    const [systemRows, userRows, unreadSystemCount, unreadUserCount] = await Promise.all([
      this.prisma.systemNotification.findMany({
        where: { status: SystemNotificationStatus.PUBLISHED },
        include: { reads: { where: { userId }, select: { readAt: true }, take: 1 } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take
      }),
      this.prisma.userNotification.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take }),
      this.prisma.systemNotification.count({ where: { status: SystemNotificationStatus.PUBLISHED, reads: { none: { userId } } } }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } })
    ]);
    const items = [...systemRows.map(systemView), ...userRows.map(userNotificationView)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    return { items, page: window.page, hasMore: systemRows.length === 20 || userRows.length === 20, unreadCount: unreadSystemCount + unreadUserCount };
  }

  @Get(controllerPath(API_ROUTES.notification(":notificationId")))
  async notification(@CurrentPrincipal() principal: Principal, @Param("notificationId") id: string) {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "notificationRead", `user:${userId}`);
    const system = await this.prisma.systemNotification.findFirst({ where: { id, status: SystemNotificationStatus.PUBLISHED }, include: { reads: { where: { userId }, select: { readAt: true }, take: 1 } } });
    if (system) return systemView(system);
    const personal = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!personal) throw Errors.notFound("Notification");
    return userNotificationView(personal);
  }

  @Post(controllerPath(API_ROUTES.notificationRead(":notificationId")))
  async markRead(@CurrentPrincipal() principal: Principal, @Param("notificationId") id: string) {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "notificationRead", `user:${userId}`);
    const system = await this.prisma.systemNotification.findFirst({ where: { id, status: SystemNotificationStatus.PUBLISHED }, select: { id: true } });
    if (system) {
      await this.prisma.notificationRead.upsert({ where: { notificationId_userId: { notificationId: id, userId } }, create: { notificationId: id, userId }, update: { readAt: new Date() } });
      return { id, readAt: new Date().toISOString() };
    }
    const updated = await this.prisma.userNotification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (!updated.count) throw Errors.notFound("Notification");
    return { id, readAt: new Date().toISOString() };
  }
}

@Controller()
@UseGuards(JwtAuthGuard)
export class UserFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.feedback))
  async list(@CurrentPrincipal() principal: Principal, @Query("page") pageValue = "1") {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "feedbackRead", `user:${userId}`);
    const window = boundedListWindow({ page: parsePage(pageValue), pageSize: 20, maxPage: 100 });
    if (window.exceeded) return { items: [], page: window.page, hasMore: false };
    const [rows, total] = await Promise.all([
      this.prisma.userFeedback.findMany({ where: { userId }, include: { replies: { orderBy: { createdAt: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take }),
      this.prisma.userFeedback.count({ where: { userId } })
    ]);
    return { items: rows.map((row) => feedbackView(row, false)), page: window.page, hasMore: window.page * 20 < total };
  }

  @Post(controllerPath(API_ROUTES.feedback))
  async create(@CurrentPrincipal() principal: Principal, @Body() body: CreateFeedbackDto) {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "feedbackCreate", `user:${userId}`);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userFeedback.create({ data: { userId, body: body.body.trim() }, include: { replies: true } });
      await tx.operationalEvent.create({ data: { eventType: "USER_FEEDBACK_CREATED", actorType: "USER", actorId: userId, entityType: "UserFeedback", entityId: created.id, requestId: currentRequestId().slice(0, 128) || null } });
      return created;
    });
    return feedbackView(row, false);
  }

  @Get(controllerPath(API_ROUTES.feedbackItem(":feedbackId")))
  async detail(@CurrentPrincipal() principal: Principal, @Param("feedbackId") id: string) {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "feedbackRead", `user:${userId}`);
    const row = await this.prisma.userFeedback.findFirst({ where: { id, userId }, include: { replies: { orderBy: { createdAt: "asc" } } } });
    if (!row) throw Errors.notFound("Feedback");
    return feedbackView(row, false);
  }
}

@Controller(controllerPath(API_ROUTES.admin.root))
@UseGuards(JwtAuthGuard, AdminRolesGuard, AdminWriteRateLimitGuard)
@Roles(AdminRole.ADMIN)
export class AdminNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  private readonly creatorInclude = { createdByAdmin: { select: { displayName: true } } } as const;

  @Get(adminPath(API_ROUTES.admin.notifications))
  async listNotifications(@Query("query") query = "", @Query("status") status = "", @Query("page") pageValue = "1") {
    const window = boundedListWindow({ page: parsePage(pageValue), pageSize: ADMIN_LIST_PAGE_SIZE, maxPage: ADMIN_LIST_MAX_PAGE });
    if (window.exceeded) return emptyBoundedPage(window.page, ADMIN_LIST_PAGE_SIZE);
    const where = {
      ...(Object.values(SystemNotificationStatus).includes(status as SystemNotificationStatus) ? { status: status as SystemNotificationStatus } : {}),
      ...(query.trim() ? { OR: [{ title: { contains: query.trim().slice(0, 100) } }, { body: { contains: query.trim().slice(0, 100) } }] } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.systemNotification.findMany({ where, include: this.creatorInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take }),
      this.prisma.systemNotification.count({ where })
    ]);
    return { items: rows.map((row) => adminSystemView(row)), page: window.page, pageSize: window.pageSize, total, totalPages: Math.ceil(total / window.pageSize) };
  }

  @Get(adminPath(API_ROUTES.admin.notification(":notificationId")))
  async getNotification(@Param("notificationId") id: string) {
    const row = await this.prisma.systemNotification.findUnique({ where: { id }, include: this.creatorInclude });
    if (!row) throw Errors.notFound("Notification");
    return adminSystemView(row);
  }

  @Post(adminPath(API_ROUTES.admin.notifications))
  async createNotification(@CurrentPrincipal() principal: Principal, @Body() body: CreateSystemNotificationDto) {
    const adminId = requireAdminId(principal);
    const row = await this.prisma.systemNotification.create({ data: { title: body.title.trim(), body: body.body.trim(), createdByAdminId: adminId }, include: this.creatorInclude });
    await audit(this.prisma, adminId, "SYSTEM_NOTIFICATION_CREATED", "SystemNotification", row.id);
    return adminSystemView(row);
  }

  @Patch(adminPath(API_ROUTES.admin.notification(":notificationId")))
  async updateNotification(@Param("notificationId") id: string, @Body() body: UpdateSystemNotificationDto) {
    const current = await this.prisma.systemNotification.findUnique({ where: { id } });
    if (!current) throw Errors.notFound("Notification");
    if (current.status !== SystemNotificationStatus.DRAFT) throw Errors.conflict("NOTIFICATION_IMMUTABLE", "Only draft notifications can be edited");
    const row = await this.prisma.systemNotification.update({ where: { id }, data: { ...(body.title !== undefined ? { title: body.title.trim() } : {}), ...(body.body !== undefined ? { body: body.body.trim() } : {}) }, include: this.creatorInclude });
    return adminSystemView(row);
  }

  @Delete(adminPath(API_ROUTES.admin.notificationDelete(":notificationId")))
  async deleteNotification(@CurrentPrincipal() principal: Principal, @Param("notificationId") id: string) {
    const adminId = requireAdminId(principal);
    const current = await this.prisma.systemNotification.findUnique({ where: { id } });
    if (!current) throw Errors.notFound("Notification");
    if (current.status !== SystemNotificationStatus.DRAFT) {
      throw Errors.conflict("NOTIFICATION_IMMUTABLE", "Only draft notifications can be deleted");
    }
    await this.prisma.systemNotification.delete({ where: { id } });
    await audit(this.prisma, adminId, "SYSTEM_NOTIFICATION_DELETED", "SystemNotification", id);
    return { id, deleted: true };
  }

  @Post(adminPath(API_ROUTES.admin.notificationPublish(":notificationId")))
  async publishNotification(@CurrentPrincipal() principal: Principal, @Param("notificationId") id: string) {
    const adminId = requireAdminId(principal);
    const current = await this.prisma.systemNotification.findUnique({ where: { id } });
    if (!current) throw Errors.notFound("Notification");
    if (current.status !== SystemNotificationStatus.DRAFT) throw Errors.conflict("INVALID_NOTIFICATION_STATE", "Only draft notifications can be published");
    const row = await this.prisma.systemNotification.update({ where: { id }, data: { status: SystemNotificationStatus.PUBLISHED, publishedAt: new Date() }, include: this.creatorInclude });
    await audit(this.prisma, adminId, "SYSTEM_NOTIFICATION_PUBLISHED", "SystemNotification", id, { fromStatus: current.status, toStatus: row.status });
    return adminSystemView(row);
  }

  @Post(adminPath(API_ROUTES.admin.notificationRetract(":notificationId")))
  async retractNotification(@CurrentPrincipal() principal: Principal, @Param("notificationId") id: string) {
    const adminId = requireAdminId(principal);
    const current = await this.prisma.systemNotification.findUnique({ where: { id } });
    if (!current) throw Errors.notFound("Notification");
    if (current.status !== SystemNotificationStatus.PUBLISHED) throw Errors.conflict("INVALID_NOTIFICATION_STATE", "Only published notifications can be retracted");
    const row = await this.prisma.systemNotification.update({ where: { id }, data: { status: SystemNotificationStatus.RETRACTED, retractedAt: new Date() }, include: this.creatorInclude });
    await audit(this.prisma, adminId, "SYSTEM_NOTIFICATION_RETRACTED", "SystemNotification", id, { fromStatus: current.status, toStatus: row.status });
    return adminSystemView(row);
  }

  @Get(adminPath(API_ROUTES.admin.feedback))
  async listFeedback(@Query("query") query = "", @Query("status") status = "", @Query("page") pageValue = "1") {
    const window = boundedListWindow({ page: parsePage(pageValue), pageSize: ADMIN_LIST_PAGE_SIZE, maxPage: ADMIN_LIST_MAX_PAGE });
    if (window.exceeded) return emptyBoundedPage(window.page, ADMIN_LIST_PAGE_SIZE);
    const where = {
      ...(Object.values(UserFeedbackStatus).includes(status as UserFeedbackStatus) ? { status: status as UserFeedbackStatus } : {}),
      ...(query.trim() ? { OR: [{ body: { contains: query.trim().slice(0, 100) } }, { userId: { contains: query.trim().slice(0, 100) } }, { user: { displayName: { contains: query.trim().slice(0, 100) } } }] } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.userFeedback.findMany({ where, include: { user: { select: { displayName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.take }),
      this.prisma.userFeedback.count({ where })
    ]);
    return { items: rows.map((row) => ({ id: row.id, body: row.body, status: row.status, internalNote: row.internalNote, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), replies: [], userId: row.userId, userName: row.user.displayName, handledByAdminId: row.handledByAdminId })), page: window.page, pageSize: window.pageSize, total, totalPages: Math.ceil(total / window.pageSize) };
  }

  @Get(adminPath(API_ROUTES.admin.feedbackItem(":feedbackId")))
  async feedbackDetail(@Param("feedbackId") id: string) {
    const row = await this.prisma.userFeedback.findUnique({ where: { id }, include: { user: { select: { displayName: true } }, replies: { orderBy: { createdAt: "asc" } } } });
    if (!row) throw Errors.notFound("Feedback");
    return { ...feedbackView(row), userId: row.userId, userName: row.user.displayName, handledByAdminId: row.handledByAdminId } satisfies AdminFeedbackView;
  }

  @Patch(adminPath(API_ROUTES.admin.feedbackItem(":feedbackId")))
  async updateFeedback(@CurrentPrincipal() principal: Principal, @Param("feedbackId") id: string, @Body() body: UpdateFeedbackDto) {
    const adminId = requireAdminId(principal);
    const current = await this.prisma.userFeedback.findUnique({ where: { id } });
    if (!current) throw Errors.notFound("Feedback");
    const nextStatus = body.status ?? current.status;
    const row = await this.prisma.userFeedback.update({ where: { id }, data: { ...(body.status ? { status: body.status, handledByAdminId: adminId } : {}), ...(body.internalNote !== undefined ? { internalNote: body.internalNote.trim() } : {}) }, include: { user: { select: { displayName: true } }, replies: { orderBy: { createdAt: "asc" } } } });
    if (body.status && body.status !== current.status) await audit(this.prisma, adminId, "FEEDBACK_STATUS_CHANGED", "UserFeedback", id, { fromStatus: current.status, toStatus: nextStatus });
    if (body.internalNote !== undefined) await audit(this.prisma, adminId, "FEEDBACK_NOTE_ADDED", "UserFeedback", id);
    return { ...feedbackView(row), userId: row.userId, userName: row.user.displayName, handledByAdminId: row.handledByAdminId } satisfies AdminFeedbackView;
  }

  @Post(adminPath(API_ROUTES.admin.feedbackReplies(":feedbackId")))
  async reply(@CurrentPrincipal() principal: Principal, @Param("feedbackId") id: string, @Body() body: FeedbackReplyDto) {
    const adminId = requireAdminId(principal);
    const feedback = await this.prisma.userFeedback.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!feedback) throw Errors.notFound("Feedback");
    const reply = await this.prisma.$transaction(async (tx) => {
      const created = await tx.feedbackReply.create({ data: { feedbackId: id, adminId, body: body.body.trim() } });
      await tx.userNotification.create({ data: { userId: feedback.userId, title: "用户反馈回复", body: body.body.trim(), sourceType: "FEEDBACK_REPLY", sourceId: id, createdByAdminId: adminId } });
      await tx.userFeedback.update({ where: { id }, data: { status: UserFeedbackStatus.PROCESSING, handledByAdminId: adminId } });
      return created;
    });
    await audit(this.prisma, adminId, "FEEDBACK_REPLIED", "UserFeedback", id);
    return { id: reply.id, body: reply.body, createdAt: reply.createdAt.toISOString() };
  }
}

function requireAdminId(principal: Principal): string {
  if (principal.kind !== "admin") throw Errors.forbidden();
  return principal.sub;
}

@Module({ controllers: [UserNotificationsController, UserFeedbackController, AdminNotificationsController] })
export class NotificationsModule {}
