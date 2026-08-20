import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  boundListQuery,
  CATALOG_FILTER_OPTIONS,
  FREE_EPISODE_COUNT,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  episodeDisplayTitle,
  type CatalogResponse,
  type DramaSearchFilters,
  type DramaCard,
  type DramaDetail
} from "@microfocus/contracts";
import { controllerPath } from "../common/http.js";
import { requireEntityId } from "../common/entity-id.js";
import { Errors } from "../common/app-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { assertNamedRateLimit, requestIpKey, type SocketRequest } from "../security/rate-limit.js";
import { catalogCardInclude, toDramaCard } from "./drama-card.js";

const CATALOG_FEATURED_LIMIT = 8;
const CATALOG_SHELF_LIMIT = 20;

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
    const rankedCards = ranked.map(toDramaCard);
    const latestCards = latestRows.map(toDramaCard);
    return {
      featured: rankedCards.slice(0, CATALOG_FEATURED_LIMIT),
      latest: latestCards,
      popular: rankedCards,
      categories: [...new Set([...rankedCards, ...latestCards].map((card) => card.category))],
      filterOptions: {
        subjects: [...CATALOG_FILTER_OPTIONS.subjects],
        settings: [...CATALOG_FILTER_OPTIONS.settings],
        backgrounds: [...CATALOG_FILTER_OPTIONS.backgrounds]
      }
    };
  }

  @Get(controllerPath(API_ROUTES.search))
  async search(
    @Req() request: SocketRequest,
    @Query("q") query = "",
    @Query("category") category = "",
    @Query("page") pageValue = "1",
    @Query("subject") subject = "",
    @Query("setting") setting = "",
    @Query("background") background = "",
    @Query("tags") tags = "",
    @Query("publishedAfter") publishedAfter = ""
  ): Promise<{
    items: DramaCard[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    await assertNamedRateLimit(this.prisma, "search", requestIpKey(request));
    const q = boundListQuery(query);
    const normalizedCategory = boundListQuery(category);
    const page = parsePage(pageValue);
    const pageSize = SEARCH_PAGE_SIZE;
    if (page > SEARCH_MAX_PAGE) {
      return { items: [], page, pageSize, total: 0, totalPages: 0 };
    }
    const boundedPublishedAfter = validPublishedAfter(publishedAfter);
    const filters: DramaSearchFilters = {
      subject: boundListQuery(subject),
      setting: boundListQuery(setting),
      background: boundListQuery(background),
      tags: tags.split(",").map((tag) => boundListQuery(tag)).filter(Boolean),
      ...(boundedPublishedAfter ? { publishedAfter: boundedPublishedAfter } : {})
    };
    const where = publicSearchWhere(q, normalizedCategory, filters);
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
      items: dramas.map(toDramaCard),
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
      ...toDramaCard(drama),
      rightsHolder: drama.rightsRecords[0]?.rightsHolder ?? "",
      episodes: drama.episodes.map((episode) => ({
        id: episode.id,
        episodeNumber: episode.episodeNumber,
        title: episodeDisplayTitle(episode.title, episode.episodeNumber),
        durationSeconds: episode.durationSeconds,
        isFree: episode.episodeNumber <= FREE_EPISODE_COUNT
      }))
    };
  }
}

export function publicSearchWhere(q: string, category: string, filters: DramaSearchFilters = {}) {
  const selectedTags = [filters.subject, filters.setting, filters.background, ...(filters.tags ?? [])].filter(
    (value): value is string => Boolean(value)
  );
  return {
    status: "PUBLISHED" as const,
    rightsRecords: {
      some: { status: "ACTIVE" as const, validUntil: { gt: new Date() } }
    },
    ...(category ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } : {}),
    ...(selectedTags.length ? { AND: selectedTags.map((tag) => ({ tagsJson: { array_contains: tag } })) } : {}),
    ...(filters.publishedAfter ? { publishedAt: { gte: new Date(filters.publishedAfter) } } : {})
  };
}

function validPublishedAfter(value: string): string | undefined {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parsePage(value: string): number {
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

@Module({ controllers: [CatalogController] })
export class CatalogModule {}
