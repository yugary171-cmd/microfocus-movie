import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  FREE_EPISODE_COUNT,
  LIST_QUERY_MAX_LENGTH,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  type CatalogResponse,
  type DramaCard,
  type DramaDetail
} from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { requireEntityId } from "../common/entity-id.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";

const CATALOG_FEATURED_LIMIT = 8;
const CATALOG_SHELF_LIMIT = 20;

const catalogCardInclude = {
  _count: { select: { episodes: true } },
  rightsRecords: { where: { status: "ACTIVE" as const }, orderBy: { version: "desc" as const }, take: 1 }
};

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.catalog))
  async catalog(@Req() request: SocketRequest): Promise<CatalogResponse> {
    await assertNamedRateLimit(this.prisma, "catalog", requestIpKey(request));
    const where = publicSearchWhere("", "");
    const [ranked, latestRows] = await Promise.all([
      this.prisma.drama.findMany({
        where,
        include: catalogCardInclude,
        orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
        take: CATALOG_SHELF_LIMIT
      }),
      this.prisma.drama.findMany({
        where,
        include: catalogCardInclude,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: CATALOG_SHELF_LIMIT
      })
    ]);
    const rankedCards = ranked.map(toCard);
    const latestCards = latestRows.map(toCard);
    return {
      featured: rankedCards.slice(0, CATALOG_FEATURED_LIMIT),
      latest: latestCards,
      popular: rankedCards,
      categories: [...new Set([...rankedCards, ...latestCards].map((card) => card.category))]
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
    const q = query.trim().slice(0, LIST_QUERY_MAX_LENGTH);
    const normalizedCategory = category.trim().slice(0, LIST_QUERY_MAX_LENGTH);
    const page = parsePage(pageValue);
    const pageSize = SEARCH_PAGE_SIZE;
    if (page > SEARCH_MAX_PAGE) {
      return { items: [], page, pageSize, total: 0, totalPages: 0 };
    }
    const where = publicSearchWhere(q, normalizedCategory);
    const [dramas, total] = await this.prisma.$transaction([
      this.prisma.drama.findMany({
        where,
        include: {
          _count: { select: { episodes: true } },
          rightsRecords: { where: { status: "ACTIVE" }, orderBy: { version: "desc" }, take: 1 }
        },
        orderBy: [{ recommendationRank: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
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

  @Get(controllerPath(API_ROUTES.drama(":dramaId")))
  async detail(
    @Req() request: SocketRequest,
    @Param("dramaId") dramaId: string
  ): Promise<DramaDetail> {
    await assertNamedRateLimit(this.prisma, "dramaDetail", requestIpKey(request));
    const id = requireEntityId(dramaId, "dramaId");
    const drama = await this.prisma.drama.findFirst({
      where: {
        id,
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
