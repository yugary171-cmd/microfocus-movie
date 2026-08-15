import {
  DRAMA_EPISODE_MAX_COUNT,
  DRAMA_TAG_MAX_COUNT,
  DRAMA_TITLE_MAX_LENGTH,
  EPISODE_DURATION_SECONDS_MAX,
  MediaStatus,
  UPLOAD_FILE_NAME_MAX_LENGTH,
} from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { dramaDraftError, uploadFileNameError } from "./drama-input";
import type { DramaInput } from "@/types/admin";

function draft(overrides: Partial<DramaInput> = {}): DramaInput {
  return {
    title: "微焦之城",
    summary: "简介",
    category: "都市",
    tags: ["都市"],
    coverUrl: "https://example.invalid/cover.jpg",
    rightsHolder: "权利方",
    licenseNumber: "license",
    rightsValidFrom: "2026-01-01",
    licenseExpiresAt: "2027-01-01",
    rightsReportNumber: "report",
    rightsMaterialObjectKey: "private/rights.pdf",
    rightsMaterialDigestSha256: "a".repeat(64),
    allowsWechatDistribution: true,
    allowsAdMonetization: true,
    allowsTranscoding: true,
    allowsPromotionalMaterial: true,
    episodes: [
      {
        id: "episode-1",
        episodeNumber: 1,
        title: "第1集",
        durationSeconds: 120,
        mediaStatus: MediaStatus.CREATED,
      },
    ],
    ...overrides,
  };
}

describe("dramaDraftError", () => {
  it("accepts a payload within the contract limits", () => {
    expect(dramaDraftError(draft())).toBe("");
  });

  it("rejects oversized titles, tag lists, and episode durations", () => {
    expect(dramaDraftError(draft({ title: "x".repeat(DRAMA_TITLE_MAX_LENGTH + 1) }))).toContain(
      "剧名不能超过",
    );
    expect(
      dramaDraftError(
        draft({ tags: Array.from({ length: DRAMA_TAG_MAX_COUNT + 1 }, (_, index) => `t${index}`) }),
      ),
    ).toContain("标签最多");
    expect(
      dramaDraftError(
        draft({
          episodes: [
            {
              id: "episode-1",
              episodeNumber: 1,
              title: "超长集",
              durationSeconds: EPISODE_DURATION_SECONDS_MAX + 1,
              mediaStatus: MediaStatus.CREATED,
            },
          ],
        }),
      ),
    ).toContain("单集时长");
    expect(
      dramaDraftError(
        draft({
          episodes: Array.from({ length: DRAMA_EPISODE_MAX_COUNT + 1 }, (_, index) => ({
            id: `episode-${index}`,
            episodeNumber: index + 1,
            title: `第${index + 1}集`,
            durationSeconds: 60,
            mediaStatus: MediaStatus.CREATED,
          })),
        }),
      ),
    ).toContain("集数不能超过");
  });
});

describe("uploadFileNameError", () => {
  it("accepts a bounded basename", () => {
    expect(uploadFileNameError("episode.mp4")).toBe("");
    expect(uploadFileNameError("  clip.mov  ")).toBe("");
  });

  it("rejects empty, path-like, and oversized names", () => {
    expect(uploadFileNameError("   ")).toContain("不能为空");
    expect(uploadFileNameError("../x.mp4")).toContain("路径分隔符");
    expect(uploadFileNameError("dir\\clip.mp4")).toContain("路径分隔符");
    expect(uploadFileNameError("a".repeat(UPLOAD_FILE_NAME_MAX_LENGTH + 1))).toContain("不能超过");
  });
});
