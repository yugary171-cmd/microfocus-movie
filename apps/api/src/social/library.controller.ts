import { Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import { API_ROUTES, type DramaLibraryItem } from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { requireEntityId } from "../common/entity-id.js";
import { Errors } from "../common/app-error.js";
import { catalogCardInclude, toDramaCard } from "../catalog/drama-card.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireUser } from "../history/history.module.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import type { SocketRequest } from "../security/rate-limit.js";
import {
  assertSocialReadLimit,
  assertSocialWriteLimit,
  emptySocialPage,
  isUniqueViolation,
  socialPageWindow,
  toSocialPage
} from "./social-helpers.js";

const libraryInclude = {
  drama: { include: catalogCardInclude }
};

@Controller()
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.meFavorites))
  async favorites(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listLibrary("favorite", userId, pageValue);
  }

  @Put(controllerPath(API_ROUTES.meFavorite(":dramaId")))
  async putFavorite(@CurrentPrincipal() principal: Principal, @Param("dramaId") dramaIdParam: string) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.requirePublishedDrama(dramaId);
    try {
      await this.prisma.dramaFavorite.create({ data: { userId, dramaId } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { dramaId };
  }

  @Delete(controllerPath(API_ROUTES.meFavorite(":dramaId")))
  async deleteFavorite(@CurrentPrincipal() principal: Principal, @Param("dramaId") dramaIdParam: string) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.prisma.dramaFavorite.deleteMany({ where: { userId, dramaId } });
    return { dramaId };
  }

  @Get(controllerPath(API_ROUTES.meLikedDramas))
  async likedDramas(
    @Req() request: SocketRequest,
    @CurrentPrincipal() principal: Principal,
    @Query("page") pageValue = "1"
  ) {
    const userId = requireUser(principal);
    await assertSocialReadLimit(this.prisma, principal, request);
    return this.listLibrary("like", userId, pageValue);
  }

  @Put(controllerPath(API_ROUTES.meLikedDrama(":dramaId")))
  async putLikedDrama(@CurrentPrincipal() principal: Principal, @Param("dramaId") dramaIdParam: string) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.requirePublishedDrama(dramaId);
    try {
      await this.prisma.dramaLike.create({ data: { userId, dramaId } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return { dramaId };
  }

  @Delete(controllerPath(API_ROUTES.meLikedDrama(":dramaId")))
  async deleteLikedDrama(@CurrentPrincipal() principal: Principal, @Param("dramaId") dramaIdParam: string) {
    const userId = requireUser(principal);
    await assertSocialWriteLimit(this.prisma, userId);
    const dramaId = requireEntityId(dramaIdParam, "dramaId");
    await this.prisma.dramaLike.deleteMany({ where: { userId, dramaId } });
    return { dramaId };
  }

  private async requirePublishedDrama(dramaId: string) {
    const drama = await this.prisma.drama.findFirst({
      where: { id: dramaId, status: "PUBLISHED" },
      select: { id: true }
    });
    if (!drama) throw Errors.notFound("Drama");
  }

  private async listLibrary(kind: "favorite" | "like", userId: string, pageValue: string) {
    const window = socialPageWindow(pageValue);
    if (window.exceeded) return emptySocialPage<DramaLibraryItem>(window.page);
    const [total, rows] =
      kind === "favorite"
        ? await Promise.all([
            this.prisma.dramaFavorite.count({ where: { userId } }),
            this.prisma.dramaFavorite.findMany({
              where: { userId },
              include: libraryInclude,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip: window.skip,
              take: window.take
            })
          ])
        : await Promise.all([
            this.prisma.dramaLike.count({ where: { userId } }),
            this.prisma.dramaLike.findMany({
              where: { userId },
              include: libraryInclude,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              skip: window.skip,
              take: window.take
            })
          ]);
    const dramaIds = rows.map((row) => row.dramaId);
    const progressRows = dramaIds.length
      ? await this.prisma.watchProgress.findMany({
          where: { userId, dramaId: { in: dramaIds } },
          include: { episode: { select: { episodeNumber: true } } }
        })
      : [];
    const progressByDrama = new Map(
      progressRows.map((row) => [
        row.dramaId,
        {
          resumeEpisodeNumber: row.episode.episodeNumber,
          resumePositionSeconds: Number(row.mediaPositionSeconds)
        }
      ])
    );
    return toSocialPage(
      rows.map((row) => {
        const resume = progressByDrama.get(row.dramaId);
        return {
          drama: toDramaCard(row.drama),
          createdAt: row.createdAt.toISOString(),
          resumeEpisodeNumber: resume?.resumeEpisodeNumber ?? null,
          resumePositionSeconds: resume?.resumePositionSeconds ?? null
        };
      }),
      window.page,
      total,
      window.pageSize
    );
  }
}
