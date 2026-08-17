import { Body, Controller, Delete, Get, Module, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { API_ROUTES, type FollowUserCard, type PublicUserProfile } from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { requireEntityId } from "../common/entity-id.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireUser } from "../history/history.module.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  OptionalJwtAuthGuard,
  OptionalPrincipal,
  type Principal
} from "../security/security.js";
import type { SocketRequest } from "../security/rate-limit.js";
import { CommentsController } from "./comments.controller.js";
import { LibraryController } from "./library.controller.js";
import { MessagesController } from "./messages.controller.js";
import {
  assertSocialReadLimit,
  assertSocialWriteLimit,
  emptySocialPage,
  followedByViewer,
  isUniqueViolation,
  publicUserSelect,
  requireActivePublicUser,
  socialPageWindow,
  toPublicUser,
  toSocialPage
} from "./social-helpers.js";

@Controller()
export class FollowController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.user(":userId")))
  @UseGuards(OptionalJwtAuthGuard)
  async getUser(
    @Req() request: SocketRequest,
    @Param("userId") userIdParam: string,
    @OptionalPrincipal() principal?: Principal
  ): Promise<PublicUserProfile> {
    await assertSocialReadLimit(this.prisma, principal, request);
    const userId = requireEntityId(userIdParam, "userId");
    const user = await requireActivePublicUser(this.prisma, userId);
    const viewerId = principal?.kind === "user" ? principal.sub : undefined;
    const followed = await followedByViewer(this.prisma, viewerId, [user.id]);
    return toPublicUser(user, followed.has(user.id));
  }

  @Post(controllerPath(API_ROUTES.userFollow(":userId")))
  @UseGuards(JwtAuthGuard)
  async follow(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userIdParam: string
  ): Promise<PublicUserProfile> {
    const followerId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, followerId);
    const followeeId = requireEntityId(userIdParam, "userId");
    if (followerId === followeeId) {
      throw Errors.badRequest("VALIDATION_ERROR", "不能关注自己");
    }
    const followee = await requireActivePublicUser(this.prisma, followeeId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userFollow.create({ data: { followerId, followeeId } });
        await tx.user.update({
          where: { id: followeeId },
          data: { followerCount: { increment: 1 } }
        });
        await tx.user.update({
          where: { id: followerId },
          data: { followingCount: { increment: 1 } }
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const refreshed = await requireActivePublicUser(this.prisma, followee.id);
    return toPublicUser(refreshed, true);
  }

  @Delete(controllerPath(API_ROUTES.userFollow(":userId")))
  @UseGuards(JwtAuthGuard)
  async unfollow(
    @CurrentPrincipal() principal: Principal,
    @Param("userId") userIdParam: string
  ): Promise<PublicUserProfile> {
    const followerId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, followerId);
    const followeeId = requireEntityId(userIdParam, "userId");
    const followee = await requireActivePublicUser(this.prisma, followeeId);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.userFollow.deleteMany({
        where: { followerId, followeeId }
      });
      if (!deleted.count) return;
      await tx.user.update({
        where: { id: followeeId },
        data: { followerCount: { decrement: 1 } }
      });
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } }
      });
    });
    const refreshed = await requireActivePublicUser(this.prisma, followee.id);
    return toPublicUser(refreshed, false);
  }

  @Get(controllerPath(API_ROUTES.userFollowers(":userId")))
  @UseGuards(OptionalJwtAuthGuard)
  async userFollowers(
    @Req() request: SocketRequest,
    @Param("userId") userIdParam: string,
    @Query("page") pageValue = "1",
    @OptionalPrincipal() principal?: Principal
  ) {
    await assertSocialReadLimit(this.prisma, principal, request);
    const userId = requireEntityId(userIdParam, "userId");
    await requireActivePublicUser(this.prisma, userId);
    return this.listFollowGraph("followers", userId, pageValue, principal);
  }

  @Get(controllerPath(API_ROUTES.userFollowing(":userId")))
  @UseGuards(OptionalJwtAuthGuard)
  async userFollowing(
    @Req() request: SocketRequest,
    @Param("userId") userIdParam: string,
    @Query("page") pageValue = "1",
    @OptionalPrincipal() principal?: Principal
  ) {
    await assertSocialReadLimit(this.prisma, principal, request);
    const userId = requireEntityId(userIdParam, "userId");
    await requireActivePublicUser(this.prisma, userId);
    return this.listFollowGraph("following", userId, pageValue, principal);
  }

  @Get(controllerPath(API_ROUTES.meFollowers))
  @UseGuards(JwtAuthGuard)
  async meFollowers(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listFollowGraph("followers", userId, pageValue, principal);
  }

  @Get(controllerPath(API_ROUTES.meFollowing))
  @UseGuards(JwtAuthGuard)
  async meFollowing(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listFollowGraph("following", userId, pageValue, principal);
  }

  private async listFollowGraph(
    direction: "followers" | "following",
    userId: string,
    pageValue: string,
    principal?: Principal
  ) {
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<FollowUserCard>(window.page);
    const where =
      direction === "followers" ? { followeeId: userId } : { followerId: userId };
    const [total, rows] = await Promise.all([
      this.prisma.userFollow.count({ where }),
      this.prisma.userFollow.findMany({
        where,
        include: {
          follower: { select: publicUserSelect },
          followee: { select: publicUserSelect }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: window.skip,
        take: window.take
      })
    ]);
    const cards = rows
      .map((row) => {
        const user = direction === "followers" ? row.follower : row.followee;
        if (user.status !== "ACTIVE") return null;
        return { user, followedAt: row.createdAt.toISOString() };
      })
      .filter((row): row is { user: (typeof rows)[number]["follower"]; followedAt: string } => Boolean(row));
    const viewerId = principal?.kind === "user" ? principal.sub : undefined;
    const followed = await followedByViewer(
      this.prisma,
      viewerId,
      cards.map((card) => card.user.id)
    );
    return toSocialPage(
      cards.map((card) => ({
        user: toPublicUser(card.user, followed.has(card.user.id)),
        followedAt: card.followedAt
      })),
      window.page,
      total,
      window.pageSize
    );
  }
}

@Module({
  controllers: [FollowController, LibraryController, CommentsController, MessagesController]
})
export class SocialModule {}
