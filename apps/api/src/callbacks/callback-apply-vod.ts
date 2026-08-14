import type { PrismaService } from "../prisma/prisma.service.js";
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
    await tx.mediaAsset.update({
      where: { id: asset.id },
      data: {
        mediaStatus: body.mediaStatus,
        transcodeStatus: body.transcodeStatus,
        machineReviewStatus: body.machineReviewStatus
      }
    });
    const failed =
      body.mediaStatus === "FAILED" ||
      body.transcodeStatus === "FAILED" ||
      body.machineReviewStatus === "REJECTED" ||
      asset.manualReviewStatus === "REJECTED" ||
      asset.wechatReviewStatus === "REJECTED";
    if (failed && asset.episode.drama.status === "PUBLISHED") {
      const now = new Date();
      await tx.drama.update({
        where: { id: asset.episode.dramaId },
        data: { status: "OFFLINE" }
      });
      const episodes = await tx.episode.findMany({
        where: { dramaId: asset.episode.dramaId },
        select: { id: true }
      });
      await tx.playbackLease.updateMany({
        where: {
          episodeId: { in: episodes.map((episode) => episode.id) },
          status: "ACTIVE"
        },
        data: { status: "REVOKED", activeKey: null, revokedAt: now }
      });
      return "PROCESSED_EMERGENCY_OFFLINE";
    }
    return "PROCESSED";
  });
}
