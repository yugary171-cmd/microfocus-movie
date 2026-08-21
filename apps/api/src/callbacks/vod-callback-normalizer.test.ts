import { describe, expect, it } from "vitest";
import { normalizeVodCallback } from "./vod-callback-normalizer.js";

describe("Tencent VOD callback normalization", () => {
  it("normalizes NewFileUpload and keeps the upload session source context", () => {
    const result = normalizeVodCallback(
      {
        EventType: "NewFileUpload",
        FileUploadEvent: {
          FileId: "file-1",
          MediaBasicInfo: {
            SourceInfo: { SourceType: "Upload", SourceContext: "upload-1" }
          }
        }
      },
      Buffer.from("new-file-upload")
    );

    expect(result).toMatchObject({
      kind: "UPLOAD_COMPLETED",
      fileId: "file-1",
      sourceContext: "upload-1"
    });
    expect(result.eventId).toMatch(/^vod:/);
  });

  it("normalizes a finished procedure with transcode and review results", () => {
    const result = normalizeVodCallback({
      EventType: "ProcedureStateChanged",
      ProcedureStateChangeEvent: {
        TaskId: "task-1",
        Status: "FINISH",
        FileId: "file-1",
        SessionContext: "upload-1",
        MediaProcessResultSet: [
          { Type: "Transcode", TranscodeTask: { Status: "SUCCESS" } },
          { Type: "ReviewAudioVideo", ReviewAudioVideoTask: { Status: "SUCCESS" } }
        ]
      }
    });

    expect(result).toMatchObject({
      kind: "STATE_CHANGED",
      fileId: "file-1",
      sourceContext: "upload-1",
      mediaStatus: "READY",
      transcodeStatus: "READY",
      machineReviewStatus: "APPROVED"
    });
  });

  it("accepts the existing normalized callback fixture shape", () => {
    expect(
      normalizeVodCallback({
        eventId: "event-1",
        fileId: "file-1",
        mediaStatus: "READY",
        transcodeStatus: "READY",
        machineReviewStatus: "APPROVED"
      })
    ).toMatchObject({ eventId: "event-1", fileId: "file-1", kind: "STATE_CHANGED" });
  });

  it("maps ReviewAudioVideoComplete suggestions to the machine-review state", () => {
    const result = normalizeVodCallback({
      EventType: "ReviewAudioVideoComplete",
      ReviewAudioVideoCompleteEvent: {
        TaskId: "review-task-1",
        Input: { FileId: "file-1" },
        Output: { Suggestion: "pass" }
      }
    });

    expect(result).toMatchObject({
      kind: "STATE_CHANGED",
      fileId: "file-1",
      machineReviewStatus: "APPROVED"
    });
    expect(result).not.toHaveProperty("mediaStatus");
  });
});
