import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  COMPENSATION_SECONDS_MIN,
  DRAMA_EPISODE_MAX_COUNT,
  DRAMA_TAG_MAX_COUNT,
  DRAMA_TITLE_MAX_LENGTH,
  ENTITY_ID_MAX_LENGTH,
  ENTITLEMENT_SECONDS_MAX,
  EPISODE_DURATION_SECONDS_MAX,
  MEDIA_REVIEW_NOTES_MAX_LENGTH,
  RECOMMENDATION_RANK_MAX,
  RECOMMENDATION_RANK_MIN,
  REVIEW_NOTES_MAX_LENGTH,
  REWARD_SECONDS,
  RIGHTS_HOLDER_MAX_LENGTH,
  RIGHTS_MATERIAL_DIGEST_LENGTH,
  RIGHTS_TERRITORY,
  UPLOAD_FILE_NAME_MAX_LENGTH,
  UPLOAD_FILE_SIZE_MAX_BYTES
} from "@microfocus/contracts";
import { AdjustEntitlementDto, CircuitCollectionDto, CompensateDto, CreateDramaDto, MediaReviewDto, OfflineDto, ReviewDto, RightsDto, UploadSignDto } from "./admin.module.js";

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

    const emptyTags = await validate(plainToInstance(CreateDramaDto, validDrama({ tags: [] })));
    expect(emptyTags.some((error) => error.property === "tags")).toBe(true);

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

    expect(
      (
        await validate(
          plainToInstance(
            CreateDramaDto,
            validDrama({ episodes: [{ episodeNumber: 1, title: "", durationSeconds: 60 }] }),
          ),
        )
      ).length
    ).toBe(0);

    expect(
      (await validate(plainToInstance(CreateDramaDto, validDrama({ recommendationRank: RECOMMENDATION_RANK_MAX + 1 })))).some(
        (error) => error.property === "recommendationRank"
      )
    ).toBe(true);
    expect(
      (await validate(plainToInstance(CreateDramaDto, validDrama({ recommendationRank: RECOMMENDATION_RANK_MIN - 1 })))).some(
        (error) => error.property === "recommendationRank"
      )
    ).toBe(true);
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
        rightsHolder: "x".repeat(RIGHTS_HOLDER_MAX_LENGTH + 1),
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:00.000Z",
        territory: RIGHTS_TERRITORY,
        allowsWechatDistribution: true,
        allowsAdMonetization: true,
        allowsTranscoding: true,
        allowsPromotionalMaterial: true,
        licenseNumber: "license",
        reportNumber: "report",
        materialObjectKey: "private/rights.pdf",
        materialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH)
      })
    );
    expect(rights.some((error) => error.property === "rightsHolder")).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(RightsDto, {
            rightsHolder: "权利方",
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2027-01-01T00:00:00.000Z",
            territory: "US",
            allowsWechatDistribution: true,
            allowsAdMonetization: true,
            allowsTranscoding: true,
            allowsPromotionalMaterial: true,
            licenseNumber: "license",
            reportNumber: "report",
            materialObjectKey: "private/rights.pdf",
            materialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH)
          })
        )
      ).some((error) => error.property === "territory")
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(RightsDto, {
            rightsHolder: "权利方",
            validFrom: "2026-01-01T00:00:00.000Z",
            validUntil: "2027-01-01T00:00:00.000Z",
            territory: RIGHTS_TERRITORY,
            allowsWechatDistribution: true,
            allowsAdMonetization: true,
            allowsTranscoding: true,
            allowsPromotionalMaterial: true,
            licenseNumber: "license",
            reportNumber: "report",
            materialObjectKey: "private/rights.pdf",
            materialDigestSha256: "g".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH)
          })
        )
      ).some((error) => error.property === "materialDigestSha256")
    ).toBe(true);
  });
});

function validCompensation(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    dramaId: "drama-1",
    seconds: REWARD_SECONDS,
    expiresAt: "2026-08-15T00:00:00.000Z",
    reason: "事故补偿工单",
    ...overrides
  };
}

describe("admin entitlement write input limits", () => {
  it("accepts a bounded compensation payload", async () => {
    expect(await validate(plainToInstance(CompensateDto, validCompensation()))).toEqual([]);
  });

  it("rejects compensation seconds outside 60–86400 and oversized ids or reasons", async () => {
    const tooSmall = await validate(
      plainToInstance(CompensateDto, validCompensation({ seconds: COMPENSATION_SECONDS_MIN - 1 }))
    );
    expect(tooSmall.some((error) => error.property === "seconds")).toBe(true);

    const tooLarge = await validate(
      plainToInstance(CompensateDto, validCompensation({ seconds: ENTITLEMENT_SECONDS_MAX + 1 }))
    );
    expect(tooLarge.some((error) => error.property === "seconds")).toBe(true);

    const longUserId = await validate(
      plainToInstance(CompensateDto, validCompensation({ userId: "u".repeat(ENTITY_ID_MAX_LENGTH + 1) }))
    );
    expect(longUserId.some((error) => error.property === "userId")).toBe(true);

    const shortReason = await validate(
      plainToInstance(CompensateDto, validCompensation({ reason: "x".repeat(ADMIN_REASON_MIN_LENGTH - 1) }))
    );
    expect(shortReason.some((error) => error.property === "reason")).toBe(true);

    const longReason = await validate(
      plainToInstance(CompensateDto, validCompensation({ reason: "x".repeat(ADMIN_REASON_MAX_LENGTH + 1) }))
    );
    expect(longReason.some((error) => error.property === "reason")).toBe(true);
  });

  it("rejects entitlement adjustment seconds above the shared max", async () => {
    const dto = plainToInstance(AdjustEntitlementDto, {
      type: "WRITE_OFF",
      grantId: "grant-1",
      seconds: ENTITLEMENT_SECONDS_MAX + 1,
      reason: "事故核销说明"
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "seconds")).toBe(true);
  });

  it("bounds remaining admin reason and circuit target fields", async () => {
    const longOffline = await validate(
      plainToInstance(OfflineDto, { reason: "x".repeat(ADMIN_REASON_MAX_LENGTH + 1) })
    );
    expect(longOffline.some((error) => error.property === "reason")).toBe(true);
    expect(await validate(plainToInstance(OfflineDto, { reason: "事故下架说明" }))).toEqual([]);

    const circuit = await validate(
      plainToInstance(CircuitCollectionDto, {
        enabled: true,
        reason: "x".repeat(ADMIN_REASON_MAX_LENGTH + 1),
        targetId: "t".repeat(ENTITY_ID_MAX_LENGTH + 1)
      })
    );
    expect(circuit.some((error) => error.property === "reason")).toBe(true);
    expect(circuit.some((error) => error.property === "targetId")).toBe(true);
    expect(
      await validate(
        plainToInstance(CircuitCollectionDto, { enabled: true, reason: "全站故障熔断" })
      )
    ).toEqual([]);
  });

  it("rejects oversized or path-like upload file names", async () => {
    const valid = {
      dramaId: "drama-1",
      episodeId: "episode-1",
      fileName: "episode.mp4",
      size: 12,
      contentType: "video/mp4"
    };
    expect(await validate(plainToInstance(UploadSignDto, valid))).toEqual([]);
    expect(
      (await validate(
        plainToInstance(UploadSignDto, {
          ...valid,
          fileName: `${"a".repeat(UPLOAD_FILE_NAME_MAX_LENGTH + 1)}.mp4`
        })
      )).some((error) => error.property === "fileName")
    ).toBe(true);
    expect(
      (await validate(plainToInstance(UploadSignDto, { ...valid, fileName: "../secret.mp4" }))).some(
        (error) => error.property === "fileName"
      )
    ).toBe(true);
    expect(
      (await validate(plainToInstance(UploadSignDto, { ...valid, fileName: "folder\\clip.mp4" }))).some(
        (error) => error.property === "fileName"
      )
    ).toBe(true);
    expect(
      (await validate(plainToInstance(UploadSignDto, { ...valid, size: 0 }))).some(
        (error) => error.property === "size"
      )
    ).toBe(true);
    expect(
      (await validate(
        plainToInstance(UploadSignDto, { ...valid, size: UPLOAD_FILE_SIZE_MAX_BYTES + 1 })
      )).some((error) => error.property === "size")
    ).toBe(true);
    expect(
      await validate(plainToInstance(UploadSignDto, { ...valid, size: UPLOAD_FILE_SIZE_MAX_BYTES }))
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(UploadSignDto, { ...valid, contentType: "application/octet-stream" })
      )
    ).toEqual([]);
    expect(
      (await validate(
        plainToInstance(UploadSignDto, { ...valid, contentType: "video/x-matroska" })
      )).some((error) => error.property === "contentType")
    ).toBe(true);
  });

  it("bounds content-review notes at 2000 and media-review notes at 500", async () => {
    expect(await validate(plainToInstance(ReviewDto, { status: "APPROVED" }))).toEqual([]);
    expect(
      await validate(plainToInstance(ReviewDto, { status: "REJECTED", notes: "需要补齐版权资料" }))
    ).toEqual([]);
    expect(
      (await validate(
        plainToInstance(ReviewDto, {
          status: "REJECTED",
          notes: "x".repeat(REVIEW_NOTES_MAX_LENGTH + 1)
        })
      )).some((error) => error.property === "notes")
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(MediaReviewDto, {
          manualReviewStatus: "APPROVED",
          notes: "人工复核通过说明"
        })
      )
    ).toEqual([]);
    expect(
      (await validate(
        plainToInstance(MediaReviewDto, {
          manualReviewStatus: "REJECTED",
          notes: "x".repeat(MEDIA_REVIEW_NOTES_MAX_LENGTH + 1)
        })
      )).some((error) => error.property === "notes")
    ).toBe(true);
  });
});
