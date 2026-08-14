import { Body, Controller, Get, Module, Put, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  ERROR_CODES,
  type UpdateWatchProgressRequest,
  type WatchHistoryItem
} from "@microfocus/contracts";
import { IsNumber, IsString, Min } from "class-validator";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";
import { assertNamedRateLimit } from "../security/rate-limit.js";

class ProgressDto implements UpdateWatchProgressRequest {
  @IsString()
  dramaId!: string;

  @IsString()
  episodeId!: string;

  @IsNumber()
  @Min(0)
  mediaPositionSeconds!: number;
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
      take: 50
    });
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
      updatedAt: row.updatedAt.toISOString()
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
    const progress = await this.prisma.watchProgress.upsert({
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
    return { updatedAt: progress.updatedAt.toISOString() };
  }
}

export function requireUser(principal: Principal): string {
  if (principal.kind !== "user") {
    throw Errors.forbidden(ERROR_CODES.USER_TOKEN_REQUIRED, "A user token is required");
  }
  return principal.sub;
}

@Module({ controllers: [HistoryController] })
export class HistoryModule {}
