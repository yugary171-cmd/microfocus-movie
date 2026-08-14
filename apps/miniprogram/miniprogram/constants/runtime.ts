/**
 * Runtime values used by the native WeChat mini program.
 *
 * The mini-program compiler does not resolve the repository's npm workspace
 * aliases at runtime, so executable constants must live inside this app.
 * Type-only imports from @microfocus/contracts remain safe because TypeScript
 * erases them before the mini-program is loaded.
 */
export const FREE_EPISODE_COUNT = 2;
export const HEARTBEAT_INTERVAL_SECONDS = 5;
export const OFFLINE_GRACE_SECONDS = 15;

export const PLAYBACK_LEASE_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED"
} as const;
