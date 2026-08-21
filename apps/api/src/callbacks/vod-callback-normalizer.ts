import { createHash } from "node:crypto";
import { ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { Errors } from "../common/app-error.js";
import type { VodCallbackBody } from "./callback-payload.js";

type UnknownRecord = Record<string, unknown>;

const MEDIA_STATUSES = new Set<NonNullable<VodCallbackBody["mediaStatus"]>>([
  "CREATED",
  "UPLOADING",
  "PROCESSING",
  "REVIEW_REJECTED",
  "PENDING_MANUAL_REVIEW",
  "PENDING_WECHAT",
  "READY",
  "FAILED"
]);

const TRANSCODE_STATUSES = new Set<NonNullable<VodCallbackBody["transcodeStatus"]>>([
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED"
]);

const REVIEW_STATUSES = new Set<NonNullable<VodCallbackBody["machineReviewStatus"]>>([
  "PENDING",
  "APPROVED",
  "REJECTED"
]);

/**
 * Normalize both the legacy internal callback fixture and Tencent VOD's 3.0
 * normal/reliable callback envelopes. Provider payloads are authenticated by
 * the controller before this function is called; this function still rejects
 * malformed or unsupported shapes and only returns fields understood by the
 * media state machine.
 */
export function normalizeVodCallback(input: unknown, rawBody?: Buffer): VodCallbackBody {
  const root = asRecord(input);
  if (isInternalCallback(root)) return normalizeInternalCallback(root);

  const event = providerEvent(root);
  const eventType = text(event.EventType);
  if (eventType === "NewFileUpload") return normalizeUploadEvent(event, rawBody);
  if (eventType === "ProcedureStateChanged") return normalizeProcedureEvent(event, rawBody);
  if (eventType === "ReviewAudioVideoComplete") return normalizeReviewEvent(event, rawBody);
  throw Errors.badRequest("UNSUPPORTED_VOD_EVENT", "Unsupported Tencent VOD callback event");
}

function normalizeInternalCallback(root: UnknownRecord): VodCallbackBody {
  const eventId = boundedText(root.eventId, "eventId");
  const fileId = boundedText(root.fileId, "fileId");
  const mediaStatus = optionalEnum(root.mediaStatus, MEDIA_STATUSES, "mediaStatus");
  const transcodeStatus = optionalEnum(root.transcodeStatus, TRANSCODE_STATUSES, "transcodeStatus");
  const machineReviewStatus = optionalEnum(
    root.machineReviewStatus,
    REVIEW_STATUSES,
    "machineReviewStatus"
  );
  if (!mediaStatus && !transcodeStatus && !machineReviewStatus) {
    throw Errors.badRequest("INVALID_VOD_CALLBACK", "VOD callback has no media state");
  }
  return {
    eventId,
    fileId,
    kind: "STATE_CHANGED",
    ...(mediaStatus ? { mediaStatus } : {}),
    ...(transcodeStatus ? { transcodeStatus } : {}),
    ...(machineReviewStatus ? { machineReviewStatus } : {})
  };
}

function normalizeUploadEvent(event: UnknownRecord, rawBody?: Buffer): VodCallbackBody {
  const upload = asRecord(event.FileUploadEvent);
  const fileId = boundedText(upload.FileId, "fileId");
  const sourceInfo = asRecord(asRecord(upload.MediaBasicInfo).SourceInfo);
  const sourceContext = optionalBoundedText(sourceInfo.SourceContext, "sourceContext");
  return {
    eventId: providerEventId(event, fileId, rawBody),
    fileId,
    kind: "UPLOAD_COMPLETED",
    ...(sourceContext ? { sourceContext } : {})
  };
}

function normalizeProcedureEvent(event: UnknownRecord, rawBody?: Buffer): VodCallbackBody {
  const procedure = asRecord(event.ProcedureStateChangeEvent);
  const fileId = boundedText(procedure.FileId, "fileId");
  const sourceContext = optionalBoundedText(procedure.SessionContext, "sourceContext");
  const results = Array.isArray(procedure.MediaProcessResultSet)
    ? procedure.MediaProcessResultSet.map(asRecord)
    : [];
  const transcodeTask = resultTask(results, "transcode", "TranscodeTask");
  const reviewTask = resultTask(results, "review", "ReviewAudioVideoTask");
  const procedureStatus = text(procedure.Status).toUpperCase();
  const procedureFailed = procedureStatus === "ERROR" || procedureStatus === "FAILED";
  const transcodeStatus = transcodeTaskStatus(
    transcodeTask,
    procedureFailed ? "FAILED" : "PROCESSING"
  );
  const machineReviewStatus = reviewTaskStatus(
    reviewTask,
    procedureFailed ? "REJECTED" : "PENDING"
  );
  const completed = procedureStatus === "FINISH";
  const mediaStatus = procedureFailed
    ? "FAILED"
    : transcodeStatus === "FAILED" || machineReviewStatus === "REJECTED"
      ? "FAILED"
      : completed && transcodeStatus === "READY" && machineReviewStatus === "APPROVED"
        ? "READY"
        : "PROCESSING";

  return {
    eventId: providerEventId(event, fileId, rawBody, text(procedure.TaskId)),
    fileId,
    kind: "STATE_CHANGED",
    mediaStatus,
    transcodeStatus,
    machineReviewStatus,
    ...(sourceContext ? { sourceContext } : {})
  };
}

function normalizeReviewEvent(event: UnknownRecord, rawBody?: Buffer): VodCallbackBody {
  const review = asRecord(event.ReviewAudioVideoCompleteEvent);
  const fileId = boundedText(asRecord(review.Input).FileId, "fileId");
  const suggestion = text(asRecord(review.Output).Suggestion).toLowerCase();
  const machineReviewStatus = suggestion === "pass"
    ? "APPROVED"
    : suggestion === "block"
      ? "REJECTED"
      : "PENDING";
  return {
    eventId: providerEventId(event, fileId, rawBody, text(review.TaskId)),
    fileId,
    kind: "STATE_CHANGED",
    machineReviewStatus,
    ...(machineReviewStatus === "REJECTED" ? { mediaStatus: "REVIEW_REJECTED" } : {})
  };
}

function resultTask(
  results: UnknownRecord[],
  type: "transcode" | "review",
  taskKey: string
): UnknownRecord | undefined {
  const result = results.find((candidate) => {
    const value = text(candidate.Type).toLowerCase();
    return type === "transcode"
      ? value === "transcode"
      : value.includes("review") || value === "aicontentreview";
  });
  return result ? asRecord(result[taskKey]) : undefined;
}

function transcodeTaskStatus(
  task: UnknownRecord | undefined,
  fallback: NonNullable<VodCallbackBody["transcodeStatus"]>
): NonNullable<VodCallbackBody["transcodeStatus"]> {
  if (!task) return fallback;
  const status = text(task.Status).toUpperCase();
  if (status === "SUCCESS" || status === "FINISH") return "READY";
  if (status === "PROCESSING" || status === "RUNNING") return "PROCESSING";
  return "FAILED";
}

function reviewTaskStatus(
  task: UnknownRecord | undefined,
  fallback: NonNullable<VodCallbackBody["machineReviewStatus"]>
): NonNullable<VodCallbackBody["machineReviewStatus"]> {
  if (!task) return fallback;
  const status = text(task.Status).toUpperCase();
  if (status === "SUCCESS" || status === "FINISH") return "APPROVED";
  if (status === "PROCESSING" || status === "RUNNING") return "PENDING";
  return "REJECTED";
}

function providerEvent(root: UnknownRecord): UnknownRecord {
  const response = asRecord(root.Response);
  const eventSet = Array.isArray(response.EventSet) ? response.EventSet : [];
  return eventSet.length ? asRecord(eventSet[0]) : root;
}

function providerEventId(
  event: UnknownRecord,
  fileId: string,
  rawBody?: Buffer,
  taskId?: string
): string {
  const eventHandle = optionalBoundedText(event.EventHandle, "eventHandle");
  if (eventHandle && eventHandle !== "EventHandle.N") return eventHandle;
  if (rawBody?.length) return `vod:${createHash("sha256").update(rawBody).digest("hex")}`;
  const suffix = taskId || text(event.EventType) || "upload";
  return `vod:${suffix}:${fileId}`.slice(0, ENTITY_ID_MAX_LENGTH);
}

function isInternalCallback(root: UnknownRecord): boolean {
  return typeof root.eventId === "string" && typeof root.fileId === "string";
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedText(value: unknown, field: string): string {
  const result = text(value);
  if (!result || result.length > ENTITY_ID_MAX_LENGTH) {
    throw Errors.badRequest("INVALID_VOD_CALLBACK", `VOD callback ${field} is invalid`);
  }
  return result;
}

function optionalBoundedText(value: unknown, field: string): string | undefined {
  const result = text(value);
  if (!result) return undefined;
  if (result.length > ENTITY_ID_MAX_LENGTH) {
    throw Errors.badRequest("INVALID_VOD_CALLBACK", `VOD callback ${field} is invalid`);
  }
  return result;
}

function optionalEnum<T extends string>(value: unknown, allowed: Set<T>, field: string): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw Errors.badRequest("INVALID_VOD_CALLBACK", `VOD callback ${field} is invalid`);
  }
  return value as T;
}
