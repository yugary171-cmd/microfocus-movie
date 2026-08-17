import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  boundMessageBody,
  type DirectConversationView,
  type DirectMessageView
} from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { requireEntityId } from "../common/entity-id.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireUser } from "../history/history.module.js";
import { toProfile } from "../profile/profile.module.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import type { SocketRequest } from "../security/rate-limit.js";
import { CreateConversationDto, CreateDirectMessageDto } from "./social.dto.js";
import {
  assertSocialMessageWriteLimit,
  assertSocialReadLimit,
  conversationPair,
  conversationPeerId,
  emptySocialPage,
  publicUserSelect,
  requireActivePublicUser,
  requireFollows,
  socialPageWindow,
  toSocialPage
} from "./social-helpers.js";

@Controller()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.meConversations))
  async listConversations(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<DirectConversationView>(window.page);
    const where = { OR: [{ userLowId: userId }, { userHighId: userId }] };
    const [total, rows] = await Promise.all([
      this.prisma.directConversation.count({ where }),
      this.prisma.directConversation.findMany({
        where,
        include: {
          userLow: { select: publicUserSelect },
          userHigh: { select: publicUserSelect }
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: window.skip,
        take: window.take
      })
    ]);
    const unread = await this.unreadCounts(
      userId,
      rows.map((row) => row.id)
    );
    return toSocialPage(
      rows.map((row) => {
        const peer = row.userLowId === userId ? row.userHigh : row.userLow;
        return {
          id: row.id,
          peer: toProfile(peer),
          lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
          unreadCount: unread.get(row.id) ?? 0
        };
      }),
      window.page,
      total,
      window.pageSize
    );
  }

  @Post(controllerPath(API_ROUTES.meConversations))
  async createConversation(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateConversationDto
  ): Promise<DirectConversationView> {
    const userId = requireUser(principal);
    await assertSocialMessageWriteLimit(this.prisma, userId);
    const peerUserId = requireEntityId(body.peerUserId, "peerUserId");
    if (peerUserId === userId) {
      throw Errors.badRequest("VALIDATION_ERROR", "不能给自己发私信");
    }
    const peer = await requireActivePublicUser(this.prisma, peerUserId);
    await requireFollows(this.prisma, userId, peerUserId);
    const pair = conversationPair(userId, peerUserId);
    const conversation = await this.prisma.directConversation.upsert({
      where: { userLowId_userHighId: pair },
      create: pair,
      update: {},
      include: {
        userLow: { select: publicUserSelect },
        userHigh: { select: publicUserSelect }
      }
    });
    const unread = await this.unreadCounts(userId, [conversation.id]);
    return {
      id: conversation.id,
      peer: toProfile(peer),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: unread.get(conversation.id) ?? 0
    };
  }

  @Get(controllerPath(API_ROUTES.meConversationMessages(":conversationId")))
  async listMessages(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Param("conversationId") conversationIdParam: string,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    const conversationId = requireEntityId(conversationIdParam, "conversationId");
    await this.requireMember(conversationId, userId);
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<DirectMessageView>(window.page);
    const where = { conversationId };
    const [total, rows] = await Promise.all([
      this.prisma.directMessage.count({ where }),
      this.prisma.directMessage.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: window.skip,
        take: window.take
      })
    ]);
    return toSocialPage(
      rows.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        senderId: row.senderId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null
      })),
      window.page,
      total,
      window.pageSize
    );
  }

  @Post(controllerPath(API_ROUTES.meConversationMessages(":conversationId")))
  async sendMessage(
    @CurrentPrincipal() principal: Principal,
    @Param("conversationId") conversationIdParam: string,
    @Body() body: CreateDirectMessageDto
  ): Promise<DirectMessageView> {
    const userId = requireUser(principal);
    await assertSocialMessageWriteLimit(this.prisma, userId);
    const conversationId = requireEntityId(conversationIdParam, "conversationId");
    const text = boundMessageBody(body.body ?? "");
    if (!text) throw Errors.badRequest("VALIDATION_ERROR", "消息不能为空");
    const conversation = await this.requireMember(conversationId, userId);
    const peerId = conversationPeerId(conversation, userId);
    await requireFollows(this.prisma, userId, peerId);
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({
        data: { conversationId, senderId: userId, body: text }
      });
      await tx.directConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now }
      });
      return created;
    });
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      readAt: null
    };
  }

  @Post(controllerPath(API_ROUTES.meConversationRead(":conversationId")))
  async markRead(
    @CurrentPrincipal() principal: Principal,
    @Param("conversationId") conversationIdParam: string
  ) {
    const userId = requireUser(principal);
    await assertSocialMessageWriteLimit(this.prisma, userId);
    const conversationId = requireEntityId(conversationIdParam, "conversationId");
    await this.requireMember(conversationId, userId);
    const now = new Date();
    await this.prisma.directMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: now }
    });
    return { conversationId, readAt: now.toISOString() };
  }

  private async requireMember(conversationId: string, userId: string) {
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userLowId: true, userHighId: true }
    });
    if (!conversation || (conversation.userLowId !== userId && conversation.userHighId !== userId)) {
      throw Errors.notFound("Conversation");
    }
    return conversation;
  }

  private async unreadCounts(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
    if (!conversationIds.length) return new Map();
    const rows = await this.prisma.directMessage.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        readAt: null
      },
      _count: { _all: true }
    });
    return new Map(rows.map((row) => [row.conversationId, row._count._all]));
  }
}
