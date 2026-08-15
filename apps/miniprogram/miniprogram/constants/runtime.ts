/**
 * Native mini-program values that are not shared through contracts.
 * Shared playback and list limits are value-imported from @microfocus/contracts.
 */
export const PLAYBACK_LEASE_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED"
} as const;
