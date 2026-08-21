import type { PrismaService } from "../prisma/prisma.service.js";
import { tryOfflinePublishedDrama } from "../catalog/offline-drama.js";
import { resolveVodMediaUpdate } from "../domain/media-state.js";
import type { VodCallbackBody } from "./callback-payload.js";

export async function applyVodCallback(
  prisma: PrismaService,
  body: VodCallbackBody
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const uploadSession = body.sourceContext
      ? await tx.uploadSession.findUnique({ where: { uploadId: body.sourceContext } })
      : await tx.uploadSession.findFirst({
          where: {
            provider: "VOD",
            fileId: body.fileId,
            status: { in: ["ISSUED", "UPLOADED", "COMPLETED"] }
          },
          orderBy: { createdAt: "desc" }
        });
    if (
      uploadSession &&
      uploadSession.provider === "VOD" &&
      uploadSession.kind === "VOD_MEDIA" &&
      ["ISSUED", "UPLOADED", "COMPLETED"].includes(uploadSession.status)
    ) {
      await tx.uploadSession.update({
        where: { id: uploadSession.id },
        data: {
          status: body.mediaStatus === "FAILED" ? "FAILED" : "COMPLETED",
          ...(body.mediaStatus === "FAILED" ? {} : { completedAt: new Date() })
        }
      });
    }
    const asset = await tx.mediaAsset.findUnique({
      where: { fileId: body.fileId },
      include: { episode: { include: { drama: true } } }
    });
    if (!asset) return "MEDIA_NOT_FOUND";
    const nextTranscodeStatus = body.transcodeStatus ?? asset.transcodeStatus!;
    const nextMachineReviewStatus = body.machineReviewStatus ?? asset.machineReviewStatus!;
    const nextMediaStatus = body.mediaStatus ?? deriveMediaStatus(
      asset.mediaStatus!,
      nextTranscodeStatus,
      nextMachineReviewStatus
    );
    const next = {
      mediaStatus: nextMediaStatus,
      transcodeStatus: nextTranscodeStatus,
      machineReviewStatus: nextMachineReviewStatus
    };
    const decision = resolveVodMediaUpdate(
      {
        mediaStatus: asset.mediaStatus,
        transcodeStatus: asset.transcodeStatus,
        machineReviewStatus: asset.machineReviewStatus
      },
      next
    );
    if (decision.action === "reject") return "REJECTED";
    if (decision.action === "apply") {
      await tx.mediaAsset.update({
        where: { id: asset.id },
        data: {
          mediaStatus: next.mediaStatus,
          transcodeStatus: next.transcodeStatus,
          machineReviewStatus: next.machineReviewStatus
        }
      });
    }
    const applied = decision.action === "apply" ? decision.next : next;
    const failed =
      applied.mediaStatus === "FAILED" ||
      applied.transcodeStatus === "FAILED" ||
      applied.machineReviewStatus === "REJECTED" ||
      asset.manualReviewStatus === "REJECTED" ||
      asset.wechatReviewStatus === "REJECTED";
    if (failed && asset.episode.drama.status === "PUBLISHED") {
      const offlined = await tryOfflinePublishedDrama(tx, asset.episode.dramaId);
      return offlined ? "PROCESSED_EMERGENCY_OFFLINE" : "PROCESSED";
    }
    return "PROCESSED";
  });
}

export async function applyVodUploadCallback(
  prisma: PrismaService,
  body: VodCallbackBody
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const session = body.sourceContext
      ? await tx.uploadSession.findUnique({ where: { uploadId: body.sourceContext } })
      : await tx.uploadSession.findFirst({
          where: {
            provider: "VOD",
            fileId: body.fileId,
            kind: "VOD_MEDIA",
            status: { in: ["ISSUED", "UPLOADED", "COMPLETED"] }
          },
          orderBy: { createdAt: "desc" }
        });
    if (!session || session.provider !== "VOD" || session.kind !== "VOD_MEDIA") {
      return "MEDIA_NOT_FOUND";
    }
    if (["FAILED", "EXPIRED"].includes(session.status)) return "REJECTED";
    if (session.fileId && session.fileId !== body.fileId) return "REJECTED";
    await tx.uploadSession.updateMany({
      where: {
        id: session.id,
        status: { in: ["ISSUED", "UPLOADED", "COMPLETED"] },
        OR: [{ fileId: null }, { fileId: body.fileId }]
      },
      data: {
        fileId: body.fileId,
        status: "COMPLETED",
        completedAt: new Date()
      }
    });
    return "MEDIA_UPLOADED";
  });
}

function deriveMediaStatus(
  current: string,
  transcodeStatus: string,
  machineReviewStatus: string
): NonNullable<VodCallbackBody["mediaStatus"]> {
  if (transcodeStatus === "FAILED" || machineReviewStatus === "REJECTED") return "FAILED";
  if (transcodeStatus === "READY" && machineReviewStatus === "APPROVED") return "READY";
  return current as NonNullable<VodCallbackBody["mediaStatus"]>;
}
