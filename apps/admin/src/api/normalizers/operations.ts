import {
  type PosterUploadAuthorization,
  type UploadCapabilities
} from "@microfocus/contracts";
import type {
  CircuitBreakerState,
  AdminCallbackEvent,
  UploadSignature,
  PageResult
} from "@/shared/types";

import {
  record,
  text,
  finiteNumber,
  dateText,
  collection
} from "./primitives";

export function normalizeCallbackEventList(value: unknown): PageResult<AdminCallbackEvent> {
  const source = record(value);
  const items = collection(value)
    .map((item) => {
      const row = record(item);
      return {
        eventId: text(row.eventId) || text(row.id),
        provider: text(row.provider),
        eventType: text(row.eventType),
        status: text(row.status),
        attempts: Math.max(0, Math.round(finiteNumber(row.attempts))),
        receivedAt: dateText(row.receivedAt),
        processedAt: dateText(row.processedAt) || null,
        processingUntil: dateText(row.processingUntil) || null,
        outcome: text(row.outcome) || null,
        payloadAvailable: row.payloadAvailable === true,
        replayable: row.replayable === true,
      };
    })
    .filter((item) => item.eventId.length > 0);
  return {
    items,
    total: Math.max(items.length, Math.round(finiteNumber(source.total))),
  };
}

export function normalizeCircuitBreaker(value: unknown): CircuitBreakerState {
  const direct = record(value);
  if (typeof direct.enabled === "boolean") {
    return {
      enabled: direct.enabled,
      reason: text(direct.reason),
      updatedAt: dateText(direct.updatedAt) || null,
      updatedBy: text(direct.updatedBy) || null,
    };
  }
  const rows = collection(value).map(record);
  const global = rows.find((row) => row.provider === "GLOBAL:GLOBAL" || row.provider === "GLOBAL");
  if (!global) {
    return { enabled: false, reason: "", updatedAt: null, updatedBy: null };
  }
  return {
    enabled: global.state === "OPEN",
    reason: text(global.reason),
    updatedAt: dateText(global.updatedAt) || null,
    updatedBy: text(global.updatedBy) || null,
  };
}

export function normalizeUploadSignature(value: unknown): UploadSignature {
  const source = record(value);
  const rawHeaders = record(source.headers);
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return {
    provider: text(source.provider) === "TENCENT_VOD" ? "TENCENT_VOD" : "MOCK",
    ...(text(source.signature) ? { signature: text(source.signature) } : {}),
    uploadUrl: text(source.uploadUrl),
    headers,
    uploadId: text(source.uploadId),
    expiresAt: dateText(source.expiresAt),
    mock: source.mock === true,
  };
}

export function normalizePosterUpload(value: unknown): PosterUploadAuthorization {
  const source = record(value);
  const rawHeaders = record(source.headers);
  return {
    uploadId: text(source.uploadId),
    uploadUrl: text(source.uploadUrl),
    headers: Object.fromEntries(
      Object.entries(rawHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    objectKey: text(source.objectKey),
    assetUrl: text(source.assetUrl),
    expiresAt: dateText(source.expiresAt),
    mock: source.mock === true,
  };
}

export function normalizeUploadCapabilities(value: unknown): UploadCapabilities {
  const source = record(value);
  const reasons = record(source.reasons);
  return {
    posterStorageReady: source.posterStorageReady === true,
    vodUploadReady: source.vodUploadReady === true,
    reasons: {
      ...(text(reasons.posterStorage) ? { posterStorage: text(reasons.posterStorage) } : {}),
      ...(text(reasons.vodUpload) ? { vodUpload: text(reasons.vodUpload) } : {}),
    },
  };
}
