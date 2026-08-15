import { describe, expect, it } from "vitest";
import { resolveVodMediaUpdate } from "./media-state.js";

const processing = {
  mediaStatus: "PROCESSING",
  transcodeStatus: "PROCESSING",
  machineReviewStatus: "PENDING"
};

const ready = {
  mediaStatus: "READY",
  transcodeStatus: "READY",
  machineReviewStatus: "APPROVED"
};

const failed = {
  mediaStatus: "FAILED",
  transcodeStatus: "FAILED",
  machineReviewStatus: "REJECTED"
};

describe("VOD media dimension updates", () => {
  it("applies a first successful callback onto processing media", () => {
    expect(resolveVodMediaUpdate(processing, ready)).toEqual({ action: "apply", next: ready });
  });

  it("treats an identical retry as a no-op", () => {
    expect(resolveVodMediaUpdate(ready, ready)).toEqual({ action: "noop" });
    expect(resolveVodMediaUpdate(failed, failed)).toEqual({ action: "noop" });
  });

  it("allows READY media to fail later for emergency offlining", () => {
    expect(resolveVodMediaUpdate(ready, failed)).toEqual({ action: "apply", next: failed });
  });

  it("rejects reviving failed media, transcode or machine review", () => {
    expect(resolveVodMediaUpdate(failed, ready)).toEqual({ action: "reject" });
    expect(
      resolveVodMediaUpdate(
        { ...ready, transcodeStatus: "FAILED" },
        ready
      )
    ).toEqual({ action: "reject" });
    expect(
      resolveVodMediaUpdate(
        { ...ready, machineReviewStatus: "REJECTED" },
        ready
      )
    ).toEqual({ action: "reject" });
  });
});
