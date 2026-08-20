import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  boundListQuery,
  FREE_EPISODE_COUNT,
  PUBLIC_CATALOG_TAG_GROUPS,
  SEARCH_MAX_PAGE,
  SEARCH_PAGE_SIZE,
  episodeDisplayTitle,
  homeFilterOptionsFromTags,
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
import { catalogTagNameMap } from "./catalog-tags.js";
import { catalogCardInclude, toDramaCard, toDramaCards } from "./drama-card.js";

const CATALOG_FEATURED_LIMIT = 8;
const CATALOG_SHELF_LIMIT = 20;

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(controllerPath(API_ROUTES.catalog))
  async catalog(@Req() request: SocketRequest): Promise<CatalogResponse> {
    await assertNamedRateLimit(this.prisma, "catalog", requestIpKey(request));
    const where = publicSearchWhere("", "");
    const [ranked, latestRows, tagRows] = await Promise.all([
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
      }),
      this.prisma.catalogTag.findMany({
        where: {
          status: "ACTIVE",
          group: { in: [...PUBLIC_CATALOG_TAG_GROUPS] }
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      })
    ]);
    const nameById = await catalogTagNameMap(this.prisma, [...ranked, ...latestRows]);
    const rankedCards = ranked.map((drama) => toDramaCard(drama, nameById));
    const latestCards = latestRows.map((drama) => toDramaCard(drama, nameById));
    return {
      featured: rankedCards.slice(0, CATALOG_FEATURED_LIMIT),
      latest: latestCards,
      popular: rankedCards,
      categories: [...new Set([...rankedCards, ...latestCards].map((card) => card.category))],
      filterOptions: homeFilterOptionsFromTags(tagRows)
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
    const tagFilter = await resolvePublicSearchTagFilter(this.prisma, filters);
    const where = publicSearchWhere(q, normalizedCategory, filters, tagFilter);
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
      items: await toDramaCards(this.prisma, dramas),
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
    const [card] = await toDramaCards(this.prisma, [drama]);
    if (!card) throw Errors.notFound("Drama");
    return {
      ...card,
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

export type PublicSearchTagFilter = Array<string | string[]>;

export async function resolvePublicSearchTagFilter(
  prisma: { catalogTag: { findMany: (args: object) => Promise<Array<{ id: string; group: string; name: string }>> } },
  filters: DramaSearchFilters
): Promise<PublicSearchTagFilter> {
  const names = [filters.subject, filters.setting, filters.background, ...(filters.tags ?? [])].filter(
    (value): value is string => Boolean(value)
  );
  if (!names.length) return [];
  const rows = await prisma.catalogTag.findMany({
    where: { status: "ACTIVE", name: { in: names } },
    select: { id: true, group: true, name: true }
  });
  const clauses: PublicSearchTagFilter = [];
  const push = (name: string | undefined, group?: string) => {
    if (!name) return;
    clauses.push(
      rows.filter((row) => row.name === name && (!group || row.group === group)).map((row) => row.id)
    );
  };
  push(filters.subject, "subjects");
  push(filters.setting, "settings");
  push(filters.background, "backgrounds");
  for (const tag of filters.tags ?? []) push(tag);
  return clauses;
}

export function publicSearchWhere(
  q: string,
  category: string,
  filters: DramaSearchFilters = {},
  tagFilter: PublicSearchTagFilter = []
) {
  const tagIds = tagFilter.map((clause) => (Array.isArray(clause) ? clause.filter(Boolean) : clause ? [clause] : []));
  const impossible = Boolean(tagFilter.length) && tagIds.some((ids) => ids.length === 0);
  const tagClauses: Array<
    | { tagsJson: { array_contains: string } }
    | { OR: Array<{ tagsJson: { array_contains: string } }> }
  > = [];
  for (const ids of tagIds) {
    const first = ids[0];
    if (!first) continue;
    if (ids.length === 1) {
      tagClauses.push({ tagsJson: { array_contains: first } });
      continue;
    }
    tagClauses.push({ OR: ids.map((id) => ({ tagsJson: { array_contains: id } })) });
  }
  return {
    status: "PUBLISHED" as const,
    rightsRecords: {
      some: { status: "ACTIVE" as const, validUntil: { gt: new Date() } }
    },
    ...(category ? { category } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } : {}),
    ...(impossible ? { id: { in: [] as string[] } } : tagClauses.length ? { AND: tagClauses } : {}),
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
