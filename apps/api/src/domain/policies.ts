import { clampPlaybackRate, isRightsMaterialDigest, type ReleaseGateStatus } from "@microfocus/contracts";

export type GrantBalance = {
  id: string;
  remainingSeconds: number;
  expiresAt: Date;
};

export type GrantDebit = { id: string; seconds: number };

export function allocateFefo(
  grants: GrantBalance[],
  requestedSeconds: number,
  now: Date
): { debits: GrantDebit[]; debitedSeconds: number; remainingSeconds: number } {
  let needed = Math.max(0, Math.floor(requestedSeconds));
  const eligible = grants
    .filter((grant) => grant.expiresAt > now && grant.remainingSeconds > 0)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const debits: GrantDebit[] = [];
  for (const grant of eligible) {
    if (needed === 0) break;
    const seconds = Math.min(needed, Math.max(0, grant.remainingSeconds));
    if (seconds > 0) debits.push({ id: grant.id, seconds });
    needed -= seconds;
  }
  const debitedSeconds = Math.max(0, Math.floor(requestedSeconds)) - needed;
  return {
    debits,
    debitedSeconds,
    remainingSeconds: Math.max(
      0,
      eligible.reduce((sum, grant) => sum + Math.max(0, grant.remainingSeconds), 0) -
        debitedSeconds
    )
  };
}

export function heartbeatDebitSeconds(input: {
  state: "playing" | "paused" | "buffering" | "background";
  mediaPositionSeconds: number;
  lastMediaPositionSeconds: number;
  serverElapsedSeconds: number;
  playbackRate: number;
  isFree: boolean;
}): number {
  if (input.isFree || input.state !== "playing") return 0;
  const mediaDelta = Math.max(
    0,
    Math.floor(input.mediaPositionSeconds - input.lastMediaPositionSeconds)
  );
  // A seek can make the media position jump by minutes between two heartbeats.
  // Bound consumption by server-observed wall time and the accepted playback
  // rate so skipped media is never charged as watched time. Two seconds of
  // jitter keeps a delayed heartbeat from undercharging normal playback.
  const rate = clampPlaybackRate(input.playbackRate);
  const serverBound = Math.max(
    0,
    Math.ceil((Math.max(0, input.serverElapsedSeconds) + 2) * rate)
  );
  return Math.min(mediaDelta, serverBound);
}

export function assertHeartbeatAnchor(
  clientPreviousMediaPositionSeconds: number,
  serverLastMediaPositionSeconds: number,
  toleranceSeconds = 1.5
): void {
  if (
    Math.abs(clientPreviousMediaPositionSeconds - serverLastMediaPositionSeconds) >
    toleranceSeconds
  ) {
    throw new Error("HEARTBEAT_ANCHOR_MISMATCH");
  }
}

export function nextMediaAnchor(input: {
  state: "playing" | "paused" | "buffering" | "background";
  serverLastMediaPositionSeconds: number;
  clientMediaPositionSeconds: number;
}): number {
  return input.state === "playing"
    ? Math.max(input.serverLastMediaPositionSeconds, input.clientMediaPositionSeconds)
    : input.serverLastMediaPositionSeconds;
}

export function isLeaseFresh(input: {
  lastSeq: number;
  lastHeartbeatAt: Date;
  now: Date;
  graceSeconds: number;
}): boolean {
  return (
    input.lastSeq > 0 &&
    input.now.getTime() - input.lastHeartbeatAt.getTime() <= input.graceSeconds * 1000
  );
}

export function releaseGateStatus(input: {
  entityApproved: boolean;
  miniProgramFilingApproved: boolean;
  wechatCategoryApproved: boolean;
  adsApproved: boolean;
  providerModesReady: boolean;
  providerImplementationsReady: boolean;
  serverVerificationReady: boolean;
}): ReleaseGateStatus {
  const blockers: string[] = [];
  if (!input.entityApproved) blockers.push("ENTITY_APPROVAL_REQUIRED");
  if (!input.miniProgramFilingApproved) blockers.push("MINIPROGRAM_FILING_REQUIRED");
  if (!input.wechatCategoryApproved) blockers.push("WECHAT_CATEGORY_APPROVAL_REQUIRED");
  if (!input.adsApproved) blockers.push("ADS_APPROVAL_REQUIRED");
  if (!input.providerModesReady) blockers.push("LIVE_PROVIDERS_REQUIRED");
  if (!input.providerImplementationsReady) {
    blockers.push("LIVE_PROVIDER_IMPLEMENTATION_REQUIRED");
  }
  if (!input.serverVerificationReady) blockers.push("SERVER_AD_VERIFICATION_REQUIRED");
  return {
    entityApproved: input.entityApproved,
    miniProgramFilingApproved: input.miniProgramFilingApproved,
    wechatCategoryApproved: input.wechatCategoryApproved,
    adsApproved: input.adsApproved,
    readyForExternalTraffic: blockers.length === 0,
    blockers
  };
}

export function publicationBlockers(input: {
  editorId: string;
  reviewerId?: string;
  now: Date;
  rights?: {
    status: string;
    licenseNumber: string;
    reportNumber: string;
    validFrom: Date;
    validUntil: Date;
    territory: string;
    allowsWechatDistribution: boolean;
    allowsAdMonetization: boolean;
    allowsTranscoding: boolean;
    allowsPromotionalMaterial: boolean;
    materialObjectKey: string;
    materialDigestSha256: string;
  };
  episodes: Array<{
    currentAsset?: {
      mediaStatus: string;
      transcodeStatus: string;
      machineReviewStatus: string;
      manualReviewStatus: string;
      wechatReviewStatus: string;
    };
  }>;
}): string[] {
  const blockers: string[] = [];
  const rights = input.rights;
  if (!rights || rights.status !== "ACTIVE") blockers.push("ACTIVE_RIGHTS_REQUIRED");
  if (!rights?.licenseNumber.trim()) blockers.push("LICENSE_NUMBER_REQUIRED");
  if (!rights?.reportNumber.trim()) blockers.push("REPORT_NUMBER_REQUIRED");
  if (rights && (rights.validFrom > input.now || rights.validUntil <= input.now)) {
    blockers.push("RIGHTS_NOT_ACTIVE");
  }
  if (rights && rights.territory !== "CN") blockers.push("CN_TERRITORY_REQUIRED");
  if (
    rights &&
    (!rights.allowsWechatDistribution ||
      !rights.allowsAdMonetization ||
      !rights.allowsTranscoding ||
      !rights.allowsPromotionalMaterial)
  ) {
    blockers.push("RIGHTS_SCOPE_INCOMPLETE");
  }
  if (rights && (!rights.materialObjectKey || !isRightsMaterialDigest(rights.materialDigestSha256))) {
    blockers.push("RIGHTS_MATERIAL_INVALID");
  }
  if (!input.episodes.length) blockers.push("EPISODES_REQUIRED");
  if (input.episodes.some((episode) => !episode.currentAsset)) {
    blockers.push("CURRENT_MEDIA_REQUIRED");
  }
  if (input.episodes.some((episode) => episode.currentAsset?.mediaStatus !== "READY")) {
    blockers.push("MEDIA_NOT_READY");
  }
  if (input.episodes.some((episode) => episode.currentAsset?.transcodeStatus !== "READY")) {
    blockers.push("TRANSCODE_NOT_READY");
  }
  if (input.episodes.some((episode) => episode.currentAsset?.machineReviewStatus !== "APPROVED")) {
    blockers.push("MACHINE_REVIEW_REQUIRED");
  }
  if (input.episodes.some((episode) => episode.currentAsset?.manualReviewStatus !== "APPROVED")) {
    blockers.push("MANUAL_REVIEW_REQUIRED");
  }
  if (input.episodes.some((episode) => episode.currentAsset?.wechatReviewStatus !== "APPROVED")) {
    blockers.push("WECHAT_REVIEW_REQUIRED");
  }
  if (!input.reviewerId) blockers.push("DRAMA_REVIEW_REQUIRED");
  if (input.reviewerId === input.editorId) blockers.push("SELF_REVIEW_FORBIDDEN");
  return blockers;
}
