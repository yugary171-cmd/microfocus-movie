import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  boundCommentBody,
  type CommentLikeView,
  type CommentView,
  type CreateCommentRequest
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
  OptionalJwtAuthGuard,
  OptionalPrincipal,
  type Principal
} from "../security/security.js";
import type { SocketRequest } from "../security/rate-limit.js";
import { CreateCommentDto } from "./social.dto.js";
import {
  assertSocialReadLimit,
  assertSocialWriteLimit,
  emptySocialPage,
  isUniqueViolation,
  optionalUserId,
  publicUserSelect,
  requireActivePublicUser,
  socialPageWindow,
  toSocialPage
} from "./social-helpers.js";

const commentAuthorInclude = {
  author: { select: publicUserSelect }
};

type CommentRow = {
  id: string;
  targetType: string;
  dramaId: string | null;
  targetUserId: string | null;
  episodeId: string | null;
  parentCommentId: string | null;
  replyToUserId: string | null;
  body: string;
  likeCount: number;
  status: string;
  createdAt: Date;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    signature: string;
    gender: string;
  };
};

@Controller()
export class CommentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.dramaComments(":dramaId")))
  @UseGuards(OptionalJwtAuthGuard)
  async listDramaComments(
    @Req() request: SocketRequest,
    @Param("dramaId") dramaIdParam: string,
    @Query("page") pageValue = "1",
    @OptionalPrincipal() principal?: Principal
  ) {
    await assertSocialReadLimit(this.prisma, principal, request);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.requirePublishedDrama(dramaId);
    return this.listRoots({ targetType: "DRAMA", dramaId }, pageValue, optionalUserId(principal));
  }

  @Post(controllerPath(API_ROUTES.dramaComments(":dramaId")))
  @UseGuards(JwtAuthGuard)
  async createDramaComment(
    @CurrentPrincipal() principal: Principal,
    @Param("dramaId") dramaIdParam: string,
    @Body() body: CreateCommentDto
  ) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.requirePublishedDrama(dramaId);
    return this.createComment(userId, { targetType: "DRAMA", dramaId, targetUserId: null }, body);
  }

  @Get(controllerPath(API_ROUTES.userWall(":userId")))
  @UseGuards(OptionalJwtAuthGuard)
  async listWall(
    @Req() request: SocketRequest,
    @Param("userId") userIdParam: string,
    @Query("page") pageValue = "1",
    @OptionalPrincipal() principal?: Principal
  ) {
    await assertSocialReadLimit(this.prisma, principal, request);
    const targetUserId = requireEntityId(userIdParam, "userId");
    await requireActivePublicUser(this.prisma, targetUserId);
    return this.listRoots({ targetType: "USER", targetUserId }, pageValue, optionalUserId(principal));
  }

  @Post(controllerPath(API_ROUTES.userWall(":userId")))
  @UseGuards(JwtAuthGuard)
  async createWallComment(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userIdParam: string,
    @Body() body: CreateCommentDto
  ) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const targetUserId = requireEntityId(userIdParam, "userId");
    await requireActivePublicUser(this.prisma, targetUserId);
    if (body.episodeId) {
      throw Errors.badRequest("VALIDATION_ERROR", "主页墙不支持剧集评论");
    }
    return this.createComment(userId, { targetType: "USER", dramaId: null, targetUserId }, body);
  }

  @Get(controllerPath(API_ROUTES.commentReplies(":commentId")))
  @UseGuards(OptionalJwtAuthGuard)
  async replies(
    @Req() request: SocketRequest,
    @Param("commentId") commentIdParam: string,
    @Query("page") pageValue = "1",
    @OptionalPrincipal() principal?: Principal
  ) {
    await assertSocialReadLimit(this.prisma, principal, request);
    const commentId = requireEntityId(commentIdParam, "commentId");
    const parent = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, status: true }
    });
    if (!parent || parent.status === "DELETED") throw Errors.notFound("Comment");
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<CommentView>(window.page);
    const where = { parentCommentId: commentId, status: "VISIBLE" };
    const [total, rows] = await Promise.all([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: commentAuthorInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take
      })
    ]);
    return toSocialPage(
      await this.toCommentViews(rows, optionalUserId(principal)),
      window.page,
      total,
      window.pageSize
    );
  }

  @Delete(controllerPath(API_ROUTES.comment(":commentId")))
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @CurrentPrincipal() principal: Principal,
    @Param("commentId") commentIdParam: string
  ) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const commentId = requireEntityId(commentIdParam, "commentId");
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorUserId: true, status: true }
    });
    if (!comment || comment.status === "DELETED") throw Errors.notFound("Comment");
    if (comment.authorUserId !== userId) throw Errors.forbidden();
    await this.prisma.comment.update({
      where: { id: commentId },
      data: { status: "DELETED", body: "" }
    });
    return { id: commentId };
  }

  @Put(controllerPath(API_ROUTES.commentLikes(":commentId")))
  @UseGuards(JwtAuthGuard)
  async likeComment(
    @CurrentPrincipal() principal: Principal,
    @Param("commentId") commentIdParam: string
  ) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const commentId = requireEntityId(commentIdParam, "commentId");
    const comment = await this.requireVisibleComment(commentId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.create({ data: { userId, commentId } });
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } }
        });
        if (comment.authorUserId !== userId) {
          await tx.user.update({
            where: { id: comment.authorUserId },
            data: { receivedCommentLikeCount: { increment: 1 } }
          });
        }
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { commentId };
  }

  @Delete(controllerPath(API_ROUTES.commentLikes(":commentId")))
  @UseGuards(JwtAuthGuard)
  async unlikeComment(
    @CurrentPrincipal() principal: Principal,
    @Param("commentId") commentIdParam: string
  ) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const commentId = requireEntityId(commentIdParam, "commentId");
    const comment = await this.requireVisibleComment(commentId);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.commentLike.deleteMany({ where: { userId, commentId } });
      if (!deleted.count) return;
      await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } }
      });
      if (comment.authorUserId !== userId) {
        await tx.user.update({
          where: { id: comment.authorUserId },
          data: { receivedCommentLikeCount: { decrement: 1 } }
        });
      }
    });
    return { commentId };
  }

  @Get(controllerPath(API_ROUTES.meComments))
  @UseGuards(JwtAuthGuard)
  async meComments(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listComments(
      { authorUserId: userId, status: "VISIBLE" },
      pageValue,
      userId,
      "desc"
    );
  }

  @Get(controllerPath(API_ROUTES.meCommentInbox))
  @UseGuards(JwtAuthGuard)
  async meCommentInbox(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listComments(
      {
        status: "VISIBLE",
        authorUserId: { not: userId },
        OR: [{ targetUserId: userId }, { replyToUserId: userId }]
      },
      pageValue,
      userId,
      "desc"
    );
  }

  @Get(controllerPath(API_ROUTES.meReceivedCommentLikes))
  @UseGuards(JwtAuthGuard)
  async meReceivedCommentLikes(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<CommentLikeView>(window.page);
    const where = { comment: { authorUserId: userId, status: "VISIBLE" }, userId: { not: userId } };
    const [total, rows] = await Promise.all([
      this.prisma.commentLike.count({ where }),
      this.prisma.commentLike.findMany({
        where,
        include: { user: { select: publicUserSelect } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: window.skip,
        take: window.take
      })
    ]);
    return toSocialPage(
      rows.map((row) => ({
        commentId: row.commentId,
        actor: toProfile(row.user),
        createdAt: row.createdAt.toISOString()
      })),
      window.page,
      total,
      window.pageSize
    );
  }

  private async requirePublishedDrama(dramaId: string) {
    const drama = await this.prisma.drama.findFirst({
      where: { id: dramaId, status: "PUBLISHED" },
      select: { id: true }
    });
    if (!drama) throw Errors.notFound("Drama");
  }

  private async requireVisibleComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorUserId: true, status: true }
    });
    if (!comment || comment.status !== "VISIBLE") throw Errors.notFound("Comment");
    return comment;
  }

  private async listRoots(
    target: { targetType: "DRAMA"; dramaId: string } | { targetType: "USER"; targetUserId: string },
    pageValue: string,
    viewerId?: string
  ) {
    return this.listComments({ ...target, parentCommentId: null, status: "VISIBLE" }, pageValue, viewerId, "desc");
  }

  private async listComments(
    where: object,
    pageValue: string,
    viewerId: string | undefined,
    createdAt: "asc" | "desc"
  ) {
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<CommentView>(window.page);
    const [total, rows] = await Promise.all([
      this.prisma.comment.count({ where }),
      this.prisma.comment.findMany({
        where,
        include: commentAuthorInclude,
        orderBy: [{ createdAt }, { id: createdAt }],
        skip: window.skip,
        take: window.take
      })
    ]);
    return toSocialPage(await this.toCommentViews(rows, viewerId), window.page, total, window.pageSize);
  }

  private async createComment(
    authorUserId: string,
    target: { targetType: "DRAMA" | "USER"; dramaId: string | null; targetUserId: string | null },
    input: CreateCommentRequest
  ): Promise<CommentView> {
    const body = boundCommentBody(input.body ?? "");
    if (!body) throw Errors.badRequest("VALIDATION_ERROR", "评论不能为空");
    let parentCommentId: string | null = null;
    let replyToUserId: string | null = target.targetType === "USER" ? target.targetUserId : null;
    let episodeId: string | null = null;
    if (input.parentCommentId) {
      const parentId = requireEntityId(input.parentCommentId, "parentCommentId");
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          status: true,
          targetType: true,
          dramaId: true,
          targetUserId: true,
          authorUserId: true
        }
      });
      if (!parent || parent.status !== "VISIBLE") throw Errors.notFound("Comment");
      if (parent.targetType !== target.targetType || parent.dramaId !== target.dramaId || parent.targetUserId !== target.targetUserId) {
        throw Errors.badRequest("VALIDATION_ERROR", "回复必须属于同一评论对象");
      }
      parentCommentId = parent.id;
      replyToUserId = parent.authorUserId;
    }
    if (input.episodeId) {
      if (target.targetType !== "DRAMA" || !target.dramaId) {
        throw Errors.badRequest("VALIDATION_ERROR", "主页墙不支持剧集评论");
      }
      const episode = await this.prisma.episode.findFirst({
        where: { id: requireEntityId(input.episodeId, "episodeId"), dramaId: target.dramaId },
        select: { id: true }
      });
      if (!episode) throw Errors.notFound("Episode");
      episodeId = episode.id;
    }
    const created = await this.prisma.comment.create({
      data: {
        targetType: target.targetType,
        dramaId: target.dramaId,
        targetUserId: target.targetUserId,
        episodeId,
        parentCommentId,
        replyToUserId,
        authorUserId,
        body,
        status: "VISIBLE"
      },
      include: commentAuthorInclude
    });
    const views = await this.toCommentViews([created], authorUserId);
    const view = views[0];
    if (!view) throw Errors.unavailable("INTERNAL_ERROR", "Failed to load comment");
    return view;
  }

  private async toCommentViews(rows: CommentRow[], viewerId?: string): Promise<CommentView[]> {
    const ids = rows.map((row) => row.id);
    const [replyCounts, likes] = await Promise.all([
      ids.length
        ? this.prisma.comment.groupBy({
            by: ["parentCommentId"],
            where: { parentCommentId: { in: ids }, status: "VISIBLE" },
            _count: { _all: true }
          })
        : [],
      viewerId && ids.length
        ? this.prisma.commentLike.findMany({
            where: { userId: viewerId, commentId: { in: ids } },
            select: { commentId: true }
          })
        : []
    ]);
    const replyCountByParent = new Map(
      replyCounts.flatMap((row) => (row.parentCommentId ? [[row.parentCommentId, row._count._all] as const] : []))
    );
    const liked = new Set(likes.map((row) => row.commentId));
    return rows.map((row) => ({
      id: row.id,
      author: toProfile(row.author),
      targetType: row.targetType === "USER" ? "USER" : "DRAMA",
      dramaId: row.dramaId,
      targetUserId: row.targetUserId,
      episodeId: row.episodeId,
      parentCommentId: row.parentCommentId,
      replyToUserId: row.replyToUserId,
      body: row.body,
      likeCount: Math.max(0, row.likeCount),
      likedByMe: liked.has(row.id),
      replyCount: replyCountByParent.get(row.id) ?? 0,
      status: row.status === "HIDDEN" || row.status === "DELETED" ? row.status : "VISIBLE",
      createdAt: row.createdAt.toISOString()
    }));
  }
}
