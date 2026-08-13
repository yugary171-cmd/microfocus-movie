import { API_ROUTES as CONTRACT_API_ROUTES } from "@microfocus/contracts";

/** Flattened mini-program adapter around the shared HTTP contract. */
export const API_ROUTES = {
  authWechat: CONTRACT_API_ROUTES.auth.wechat,
  catalog: CONTRACT_API_ROUTES.catalog,
  search: CONTRACT_API_ROUTES.search,
  history: CONTRACT_API_ROUTES.history,
  progress: CONTRACT_API_ROUTES.progress,
  drama: (id: string) => CONTRACT_API_ROUTES.drama(encodeURIComponent(id)),
  entitlement: (dramaId: string) =>
    CONTRACT_API_ROUTES.entitlement(encodeURIComponent(dramaId)),
  rewardChallenges: CONTRACT_API_ROUTES.rewardChallenges,
  completeReward: (challengeId: string) =>
    CONTRACT_API_ROUTES.rewardComplete(encodeURIComponent(challengeId)),
  playbackLeases: CONTRACT_API_ROUTES.playbackLeases,
  heartbeat: (leaseId: string) =>
    CONTRACT_API_ROUTES.playbackHeartbeat(encodeURIComponent(leaseId)),
  renewLease: (leaseId: string) =>
    CONTRACT_API_ROUTES.playbackRenew(encodeURIComponent(leaseId)),
  closeLease: (leaseId: string) =>
    CONTRACT_API_ROUTES.playbackLease(encodeURIComponent(leaseId))
} as const;
