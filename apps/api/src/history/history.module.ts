import { Body, Controller, Delete, Get, Module, Put, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  ENTITY_ID_MAX_LENGTH,
  EPISODE_COMPLETE_TOLERANCE_SECONDS,
  EPISODE_DURATION_SECONDS_MAX,
  ERROR_CODES,
  HISTORY_DELETE_MAX_IDS,
  HISTORY_LIST_LIMIT,
  uniqueHistoryDramaIds,
  type DeleteWatchHistoryRequest,
  type DeleteWatchHistoryResponse,
  type UpdateWatchProgressRequest,
  type WatchHistoryItem
} from "@microfocus/contracts";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";

export class ProgressDto implements UpdateWatchProgressRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  dramaId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(ENTITY_ID_MAX_LENGTH)
  episodeId!: string;

  @IsNumber()
  @Min(0)
  @Max(EPISODE_DURATION_SECONDS_MAX)
  mediaPositionSeconds!: number;
}

export class DeleteHistoryDto implements DeleteWatchHistoryRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(HISTORY_DELETE_MAX_IDS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(ENTITY_ID_MAX_LENGTH, { each: true })
  dramaIds!: string[];
}

@Controller()
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.history))
  async history(@CurrentPrincipal() principal: Principal): Promise<WatchHistoryItem[]> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "watchHistory", `user:${userId}`);
    const rows = await this.prisma.watchProgress.findMany({
      where: { userId },
      include: {
        episode: true,
        drama: {
          include: {
            _count: { select: { episodes: true } },
            rightsRecords: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 }
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: HISTORY_LIST_LIMIT
    });
    const dramaIds = rows.map((row) => row.dramaId);
    const completedByDrama = new Map<string, number>();
    if (dramaIds.length) {
      const completed = await this.prisma.watchEpisodeProgress.groupBy({
        by: ["dramaId"],
        where: { userId, dramaId: { in: dramaIds }, completedAt: { not: null } },
        _count: { _all: true }
      });
      for (const row of completed) {
        completedByDrama.set(row.dramaId, row._count._all);
      }
    }
    return rows.map((row) => ({
      drama: {
        id: row.drama.id,
        title: row.drama.title,
        summary: row.drama.summary,
        coverUrl: row.drama.coverUrl,
        category: row.drama.category,
        tags: Array.isArray(row.drama.tagsJson)
          ? row.drama.tagsJson.filter((tag): tag is string => typeof tag === "string")
          : [],
        episodeCount: row.drama._count.episodes,
        recommendationRank: row.drama.recommendationRank,
        licenseNumber: row.drama.rightsRecords[0]?.licenseNumber ?? ""
      },
      episodeNumber: row.episode.episodeNumber,
      mediaPositionSeconds: Number(row.mediaPositionSeconds),
      updatedAt: row.updatedAt.toISOString(),
      completed: isDramaCompleted(row.drama._count.episodes, completedByDrama.get(row.dramaId) ?? 0)
    }));
  }

  @Put(controllerPath(API_ROUTES.progress))
  async progress(@CurrentPrincipal() principal: Principal, @Body() body: ProgressDto) {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "watchProgress", `user:${userId}`);
    const episode = await this.prisma.episode.findFirst({
      where: { id: body.episodeId, dramaId: body.dramaId },
      include: { drama: true }
    });
    if (!episode || episode.drama.status !== "PUBLISHED") {
      throw Errors.notFound("Episode");
    }
    const bounded = Math.min(body.mediaPositionSeconds, episode.durationSeconds);
    const now = new Date();
    const watchedThrough = isEpisodeWatchedThrough(bounded, episode.durationSeconds);
    const progress = await this.prisma.$transaction(async (tx) => {
      const cursor = await tx.watchProgress.upsert({
        where: { userId_dramaId: { userId, dramaId: body.dramaId } },
        create: {
          userId,
          dramaId: body.dramaId,
          episodeId: body.episodeId,
          mediaPositionSeconds: bounded
        },
        update: {
          episodeId: body.episodeId,
          mediaPositionSeconds: bounded
        }
      });
      const existing = await tx.watchEpisodeProgress.findUnique({
        where: { userId_episodeId: { userId, episodeId: body.episodeId } },
        select: { completedAt: true }
      });
      const completedAt = existing?.completedAt ?? (watchedThrough ? now : null);
      await tx.watchEpisodeProgress.upsert({
        where: { userId_episodeId: { userId, episodeId: body.episodeId } },
        create: {
          userId,
          dramaId: body.dramaId,
          episodeId: body.episodeId,
          mediaPositionSeconds: bounded,
          completedAt
        },
        update: {
          dramaId: body.dramaId,
          mediaPositionSeconds: bounded,
          ...(existing?.completedAt ? {} : { completedAt })
        }
      });
      return cursor;
    });
    return { updatedAt: progress.updatedAt.toISOString() };
  }

  @Delete(controllerPath(API_ROUTES.history))
  async deleteHistory(
    @CurrentPrincipal() principal: Principal,
    @Body() body: DeleteHistoryDto
  ): Promise<DeleteWatchHistoryResponse> {
    const userId = requireUser(principal);
    await assertNamedRateLimit(this.prisma, "watchHistoryDelete", `user:${userId}`);
    const dramaIds = uniqueHistoryDramaIds(body.dramaIds);
    if (!dramaIds.length) {
      throw Errors.badRequest(ERROR_CODES.INVALID_ENTITY_ID, "dramaIds is required");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.watchProgress.findMany({
        where: { userId, dramaId: { in: dramaIds } },
        select: { dramaId: true }
      });
      const deletedDramaIds = existing.map((row) => row.dramaId);
      if (deletedDramaIds.length) {
        await tx.watchProgress.deleteMany({
          where: { userId, dramaId: { in: deletedDramaIds } }
        });
        await tx.watchEpisodeProgress.deleteMany({
          where: { userId, dramaId: { in: deletedDramaIds } }
        });
      }
      return { deletedDramaIds };
    });
  }
}

export function requireUser(principal: Principal): string {
  if (principal.kind !== "user") {
    throw Errors.forbidden(ERROR_CODES.USER_TOKEN_REQUIRED, "A user token is required");
  }
  return principal.sub;
}

export function isEpisodeWatchedThrough(positionSeconds: number, durationSeconds: number): boolean {
  return positionSeconds + EPISODE_COMPLETE_TOLERANCE_SECONDS >= durationSeconds;
}

export function isDramaCompleted(episodeCount: number, completedEpisodeCount: number): boolean {
  return episodeCount > 0 && completedEpisodeCount >= episodeCount;
}

@Module({ controllers: [HistoryController] })
export class HistoryModule {}
