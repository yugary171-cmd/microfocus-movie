import { PLAYBACK_RATE_MAX, clampPlaybackRate } from "@microfocus/contracts";

export const PLAYBACK_TAP_MOVE_MAX_PX = 16;
export const PLAYBACK_TAP_MAX_MS = 320;
export const PLAYBACK_HOLD_MS = 400;

export function isPlaybackTap(distanceY: number, elapsedMs: number): boolean {
  const distance = Number(distanceY);
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(distance) || !Number.isFinite(elapsed)) return false;
  return Math.abs(distance) <= PLAYBACK_TAP_MOVE_MAX_PX && elapsed > 0 && elapsed <= PLAYBACK_TAP_MAX_MS;
}

export function shouldStartHoldBoost(playing: boolean, distanceY: number, elapsedMs: number): boolean {
  if (!playing) return false;
  const distance = Number(distanceY);
  const elapsed = Number(elapsedMs);
  if (!Number.isFinite(distance) || !Number.isFinite(elapsed)) return false;
  return Math.abs(distance) <= PLAYBACK_TAP_MOVE_MAX_PX && elapsed >= PLAYBACK_HOLD_MS;
}

export function holdBoostRate(): number {
  return PLAYBACK_RATE_MAX;
}

export function restoreHoldRate(selectedRate: number): number {
  return clampPlaybackRate(selectedRate);
}
