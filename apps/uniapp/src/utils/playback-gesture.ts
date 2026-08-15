export const PLAYBACK_TAP_MOVE_MAX_PX = 16;
export const PLAYBACK_TAP_MAX_MS = 320;

export function isPlaybackTap(distanceY: number, elapsedMs: number): boolean {
  const distance = Number(distanceY);
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(distance) || !Number.isFinite(elapsed)) return false;
  return Math.abs(distance) <= PLAYBACK_TAP_MOVE_MAX_PX && elapsed > 0 && elapsed <= PLAYBACK_TAP_MAX_MS;
}
