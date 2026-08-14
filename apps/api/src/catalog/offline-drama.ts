export type OfflineStore = {
  drama: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  episode: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
  };
  playbackLease: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export async function tryOfflinePublishedDrama(
  prisma: OfflineStore,
  dramaId: string,
  now = new Date()
): Promise<boolean> {
  const updated = await prisma.drama.updateMany({
    where: { id: dramaId, status: "PUBLISHED" },
    data: { status: "OFFLINE" }
  });
  if (!updated.count) return false;
  const episodes = await prisma.episode.findMany({
    where: { dramaId },
    select: { id: true }
  });
  await prisma.playbackLease.updateMany({
    where: { episodeId: { in: episodes.map((episode) => episode.id) }, status: "ACTIVE" },
    data: { status: "REVOKED", activeKey: null, revokedAt: now }
  });
  return true;
}
