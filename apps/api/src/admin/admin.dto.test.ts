import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  DRAMA_EPISODE_MAX_COUNT,
  DRAMA_TAG_MAX_COUNT,
  DRAMA_TITLE_MAX_LENGTH,
  EPISODE_DURATION_SECONDS_MAX
} from "@microfocus/contracts";
import { CreateDramaDto, RightsDto } from "./admin.module.js";

function validDrama(overrides: Record<string, unknown> = {}) {
  return {
    title: "微焦之城",
    summary: "用于本地开发的短剧样例。",
    coverUrl: "https://example.invalid/cover.jpg",
    category: "都市",
    tags: ["都市", "成长"],
    recommendationRank: 1,
    episodes: [{ episodeNumber: 1, title: "第1集", durationSeconds: 120 }],
    ...overrides
  };
}

describe("admin content input limits", () => {
  it("accepts a bounded drama create payload", async () => {
    const dto = plainToInstance(CreateDramaDto, validDrama());
    expect(await validate(dto)).toEqual([]);
  });

  it("rejects oversized titles, tag lists, and episode lists", async () => {
    const tooLongTitle = await validate(
      plainToInstance(CreateDramaDto, validDrama({ title: "x".repeat(DRAMA_TITLE_MAX_LENGTH + 1) }))
    );
    expect(tooLongTitle.some((error) => error.property === "title")).toBe(true);

    const tooManyTags = await validate(
      plainToInstance(
        CreateDramaDto,
        validDrama({ tags: Array.from({ length: DRAMA_TAG_MAX_COUNT + 1 }, (_, index) => `t${index}`) })
      )
    );
    expect(tooManyTags.some((error) => error.property === "tags")).toBe(true);

    const tooManyEpisodes = await validate(
      plainToInstance(
        CreateDramaDto,
        validDrama({
          episodes: Array.from({ length: DRAMA_EPISODE_MAX_COUNT + 1 }, (_, index) => ({
            episodeNumber: index + 1,
            title: `第${index + 1}集`,
            durationSeconds: 60
          }))
        })
      )
    );
    expect(tooManyEpisodes.some((error) => error.property === "episodes")).toBe(true);
  });

  it("rejects an episode longer than one hour and unbounded rights strings", async () => {
    const longEpisode = await validate(
      plainToInstance(
        CreateDramaDto,
        validDrama({
          episodes: [{ episodeNumber: 1, title: "超长集", durationSeconds: EPISODE_DURATION_SECONDS_MAX + 1 }]
        })
      )
    );
    expect(longEpisode.some((error) => error.property === "episodes")).toBe(true);

    const rights = await validate(
      plainToInstance(RightsDto, {
        rightsHolder: "x".repeat(201),
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:00.000Z",
        territory: "CN",
        allowsWechatDistribution: true,
        allowsAdMonetization: true,
        allowsTranscoding: true,
        allowsPromotionalMaterial: true,
        licenseNumber: "license",
        reportNumber: "report",
        materialObjectKey: "private/rights.pdf",
        materialDigestSha256: "a".repeat(64)
      })
    );
    expect(rights.some((error) => error.property === "rightsHolder")).toBe(true);
  });
});
