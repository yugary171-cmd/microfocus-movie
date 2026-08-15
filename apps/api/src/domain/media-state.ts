export type VodMediaDimensions = {
  mediaStatus: string;
  transcodeStatus: string;
  machineReviewStatus: string;
};

export type VodMediaUpdate =
  | { action: "apply"; next: VodMediaDimensions }
  | { action: "noop" }
  | { action: "reject" };

const MEDIA_SUCCESS = new Set(["READY"]);
const MEDIA_FAILURE = new Set(["FAILED", "REVIEW_REJECTED"]);
const TRANSCODE_SUCCESS = new Set(["READY"]);
const TRANSCODE_FAILURE = new Set(["FAILED"]);
const REVIEW_SUCCESS = new Set(["APPROVED"]);
const REVIEW_FAILURE = new Set(["REJECTED"]);

function dimensionMove(
  current: string,
  next: string,
  success: Set<string>,
  failure: Set<string>
): "same" | "apply" | "reject" {
  if (current === next) return "same";
  if (failure.has(current) && success.has(next)) return "reject";
  return "apply";
}

/** VOD callbacks may advance or fail a dimension; they must not revive a failed one. */
export function resolveVodMediaUpdate(
  current: VodMediaDimensions,
  next: VodMediaDimensions
): VodMediaUpdate {
  const media = dimensionMove(
    current.mediaStatus,
    next.mediaStatus,
    MEDIA_SUCCESS,
    MEDIA_FAILURE
  );
  const transcode = dimensionMove(
    current.transcodeStatus,
    next.transcodeStatus,
    TRANSCODE_SUCCESS,
    TRANSCODE_FAILURE
  );
  const machine = dimensionMove(
    current.machineReviewStatus,
    next.machineReviewStatus,
    REVIEW_SUCCESS,
    REVIEW_FAILURE
  );
  if (media === "reject" || transcode === "reject" || machine === "reject") {
    return { action: "reject" };
  }
  if (media === "same" && transcode === "same" && machine === "same") {
    return { action: "noop" };
  }
  return { action: "apply", next };
}
