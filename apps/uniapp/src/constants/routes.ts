/** Flattened mini-program adapter around the shared HTTP contract. */
export const API_ROUTES = {
  authWechat: "/v1/auth/wechat",
  catalog: "/v1/catalog",
  search: "/v1/search",
  history: "/v1/me/history",
  progress: "/v1/me/progress",
  drama: (id: string) => `/v1/dramas/${encodeURIComponent(id)}`,
  entitlement: (dramaId: string) =>
    `/v1/entitlements/${encodeURIComponent(dramaId)}`,
  rewardChallenges: "/v1/rewards/challenges",
  completeReward: (challengeId: string) =>
    `/v1/rewards/challenges/${encodeURIComponent(challengeId)}/complete`,
  playbackLeases: "/v1/playback/leases",
  heartbeat: (leaseId: string) =>
    `/v1/playback/leases/${encodeURIComponent(leaseId)}/heartbeats`,
  renewLease: (leaseId: string) => `/v1/playback/leases/${encodeURIComponent(leaseId)}/renew`,
  closeLease: (leaseId: string) => `/v1/playback/leases/${encodeURIComponent(leaseId)}`
} as const;
