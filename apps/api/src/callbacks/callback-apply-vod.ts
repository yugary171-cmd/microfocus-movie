import type { PrismaService } from "../prisma/prisma.service.js";
import { tryOfflinePublishedDrama } from "../catalog/offline-drama.js";
import { resolveVodMediaUpdate } from "../domain/media-state.js";
import type { VodCallbackBody } from "./callback-payload.js";

export async function applyVodCallback(
  prisma: PrismaService,
  body: VodCallbackBody
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.findUnique({
      where: { fileId: body.fileId },
      include: { episode: { include: { drama: true } } }
    });
    if (!asset) return "MEDIA_NOT_FOUND";
    const next = {
      mediaStatus: body.mediaStatus,
      transcodeStatus: body.transcodeStatus,
      machineReviewStatus: body.machineReviewStatus
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
          mediaStatus: body.mediaStatus,
          transcodeStatus: body.transcodeStatus,
          machineReviewStatus: body.machineReviewStatus
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
