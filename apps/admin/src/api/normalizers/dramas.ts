import {
  DramaStatus,
  MediaStatus
} from "@microfocus/contracts";
import type {
  DramaRecord,
  EpisodeRecord
} from "@/shared/types";

import {
  record,
  array,
  text,
  finiteNumber,
  dateText,
  enumValue,
  latestRecord,
  collection
} from "./primitives";

export function normalizeEpisode(value: unknown): EpisodeRecord {
  const source = record(value);
  const assets = array(source.mediaAssets).map(record);
  const currentAsset = assets.find((asset) => asset.isCurrent === true) ?? assets[0] ?? {};
  return {
    id: text(source.id),
    episodeNumber: Math.max(0, Math.round(finiteNumber(source.episodeNumber))),
    title: text(source.title),
    durationSeconds: Math.max(0, Math.round(finiteNumber(source.durationSeconds))),
    mediaStatus: enumValue(
      currentAsset.mediaStatus ?? source.mediaStatus,
      Object.values(MediaStatus),
      MediaStatus.CREATED,
    ),
    transcodeStatus: enumValue(
      currentAsset.transcodeStatus ?? source.transcodeStatus,
      ["PENDING", "PROCESSING", "READY", "FAILED"] as const,
      "PENDING",
    ),
    machineReviewStatus: enumValue(
      currentAsset.machineReviewStatus ?? source.machineReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    manualReviewStatus: enumValue(
      currentAsset.manualReviewStatus ?? source.manualReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    wechatReviewStatus: enumValue(
      currentAsset.wechatReviewStatus ?? source.wechatReviewStatus,
      ["PENDING", "APPROVED", "REJECTED"] as const,
      "PENDING",
    ),
    ...(text(currentAsset.fileId) || text(source.vodFileId)
      ? { vodFileId: text(currentAsset.fileId) || text(source.vodFileId) }
      : {}),
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeDrama(value: unknown): DramaRecord {
  const source = record(value);
  const editor = record(source.editor);
  const rights = latestRecord(source.rightsRecords);
  const reviews = array(source.reviews).map(record);
  const approvedReview = reviews.some((review) => review.status === "APPROVED");
  const episodes = array(source.episodes).map(normalizeEpisode);
  const hasEpisodes = episodes.length > 0;
  const assets = array(source.episodes).map((episode) => {
    const mediaAssets = array(record(episode).mediaAssets).map(record);
    return mediaAssets.find((asset) => asset.isCurrent === true) ?? mediaAssets[0] ?? {};
  });
  return {
    id: text(source.id),
    title: text(source.title),
    summary: text(source.summary),
    category: text(source.category),
    tags: array(source.tags).filter((item): item is string => typeof item === "string"),
    tagIds: array(source.tagIds ?? source.tagsJson).filter((item): item is string => typeof item === "string"),
    coverUrl: text(source.coverUrl),
    promoCoverUrl: text(source.promoCoverUrl),
    status: enumValue(source.status, Object.values(DramaStatus), DramaStatus.DRAFT),
    ownerId: text(source.ownerId) || text(source.editorId) || text(editor.id),
    ownerName: text(source.ownerName) || text(editor.email),
    rightsHolder: text(rights.rightsHolder) || text(source.rightsHolder),
    licenseNumber: text(rights.licenseNumber) || text(source.licenseNumber),
    rightsValidFrom: dateText(source.rightsValidFrom) || dateText(rights.validFrom),
    licenseExpiresAt: dateText(rights.validUntil) || dateText(source.licenseExpiresAt),
    rightsReportNumber:
      text(source.rightsReportNumber) || text(source.reportNumber) || text(rights.reportNumber),
    rightsMaterialObjectKey:
      text(source.rightsMaterialObjectKey) ||
      text(source.materialObjectKey) ||
      text(rights.materialObjectKey),
    rightsMaterialDigestSha256:
      text(source.rightsMaterialDigestSha256) ||
      text(source.materialDigestSha256) ||
      text(rights.materialDigestSha256),
    allowsWechatDistribution:
      source.allowsWechatDistribution === true || rights.allowsWechatDistribution === true,
    allowsAdMonetization:
      source.allowsAdMonetization === true || rights.allowsAdMonetization === true,
    allowsTranscoding:
      source.allowsTranscoding === true || rights.allowsTranscoding === true,
    allowsPromotionalMaterial:
      source.allowsPromotionalMaterial === true ||
      rights.allowsPromotionalMaterial === true,
    contentApproved: source.contentApproved === true || approvedReview,
    copyrightVerified: source.copyrightVerified === true || rights.status === "ACTIVE",
    wechatApproved:
      source.wechatApproved === true ||
      (hasEpisodes &&
        assets.length === episodes.length &&
        assets.every((asset) => asset.wechatReviewStatus === "APPROVED")),
    episodes,
    updatedAt: dateText(source.updatedAt),
  };
}

export function normalizeDramaList(value: unknown): DramaRecord[] {
  return collection(value).map(normalizeDrama).filter((drama) => drama.id.length > 0);
}
