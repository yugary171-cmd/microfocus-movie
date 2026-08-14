import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  FREE_EPISODE_COUNT,
  type CatalogResponse,
  type DramaCard,
  type DramaDetail
} from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.catalog))
  async catalog(@Req() request: SocketRequest): Promise<CatalogResponse> {
    await assertNamedRateLimit(this.prisma, "catalog", requestIpKey(request));
    const dramas = await this.prisma.drama.findMany({
      where: {
        status: "PUBLISHED",
        rightsRecords: { some: { status: "ACTIVE", validUntil: { gt: new Date() } } }
      },
      include: {
        _count: { select: { episodes: true } },
        rightsRecords: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 }
      },
      orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }],
      take: 60
    });
    const cards = dramas.map(toCard);
    return {
      featured: cards.slice(0, 8),
      latest: [...cards].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 20),
      popular: cards.slice(0, 20),
      categories: [...new Set(cards.map((card) => card.category))]
    };
  }

  @Get(controllerPath(API_ROUTES.search))
  async search(
    @Req() request: SocketRequest,
    @Query("q") query = "",
    @Query("category") category = "",
    @Query("page") pageValue = "1"
  ): Promise<{
    items: DramaCard[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    await assertNamedRateLimit(this.prisma, "search", requestIpKey(request));
    const q = query.trim().slice(0, 100);
    const normalizedCategory = category.trim().slice(0, 100);
    const page = parsePage(pageValue);
    const pageSize = 20;
    const where = publicSearchWhere(q, normalizedCategory);
    const [dramas, total] = await this.prisma.$transaction([
      this.prisma.drama.findMany({
        where,
        include: {
          _count: { select: { episodes: true } },
          rightsRecords: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 }
        },
        orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.drama.count({ where })
    ]);
    return {
      items: dramas.map(toCard),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  @Get("v1/dramas/:dramaId")
  async detail(
    @Req() request: SocketRequest,
    @Param("dramaId") dramaId: string
  ): Promise<DramaDetail> {
    await assertNamedRateLimit(this.prisma, "dramaDetail", requestIpKey(request));
    const drama = await this.prisma.drama.findFirst({
      where: {
        id: dramaId,
        status: "PUBLISHED",
        rightsRecords: { some: { status: "ACTIVE", validUntil: { gt: new Date() } } }
      },
      include: {
        episodes: { orderBy: { episodeNumber: "asc" } },
        rightsRecords: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 },
        _count: { select: { episodes: true } }
      }
    });
    if (!drama) throw Errors.notFound("Drama");
    return {
      ...toCard(drama),
      rightsHolder: drama.rightsRecords[0]?.rightsHolder ?? "",
      episodes: drama.episodes.map((episode) => ({
        id: episode.id,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        durationSeconds: episode.durationSeconds,
        isFree: episode.episodeNumber <= FREE_EPISODE_COUNT
      }))
    };
  }
}

export function publicSearchWhere(q: string, category: string) {
  return {
    status: "PUBLISHED" as const,
    rightsRecords: {
      some: { status: "ACTIVE" as const, validUntil: { gt: new Date() } }
    },
    ...(category ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } : {})
  };
}

function parsePage(value: string): number {
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function toCard(drama: {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  category: string;
  tagsJson: unknown;
  recommendationRank: number;
  rightsRecords: Array<{ licenseNumber: string }>;
  _count: { episodes: number };
}): DramaCard {
  return {
    id: drama.id,
    title: drama.title,
    summary: drama.summary,
    coverUrl: drama.coverUrl,
    category: drama.category,
    tags: Array.isArray(drama.tagsJson)
      ? drama.tagsJson.filter((tag): tag is string => typeof tag === "string")
      : [],
    episodeCount: drama._count.episodes,
    recommendationRank: drama.recommendationRank,
    licenseNumber: drama.rightsRecords[0]?.licenseNumber ?? ""
  };
}

@Module({ controllers: [CatalogController] })
export class CatalogModule {}
