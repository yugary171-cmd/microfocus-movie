import { EPISODE_COMPLETE_TOLERANCE_SECONDS } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { isDramaCompleted, isEpisodeWatchedThrough } from "./history.module.js";

describe("episode and drama completion", () => {
  it("treats positions within the end tolerance as watched through", () => {
    expect(isEpisodeWatchedThrough(117, 120)).toBe(true);
    expect(isEpisodeWatchedThrough(116, 120)).toBe(false);
    expect(EPISODE_COMPLETE_TOLERANCE_SECONDS).toBe(3);
  });

  it("requires every current episode to be complete", () => {
    expect(isDramaCompleted(4, 4)).toBe(true);
    expect(isDramaCompleted(5, 4)).toBe(false);
    expect(isDramaCompleted(0, 0)).toBe(false);
  });
});
