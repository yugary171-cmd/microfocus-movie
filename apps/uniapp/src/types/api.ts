import type {
  AnonymousSessionResponse,
  CatalogResponse,
  CompleteRewardChallengeRequest,
  CreateAnonymousSessionRequest,
  CreatePlaybackLeaseRequest,
  CreateRewardChallengeRequest,
  DramaCard,
  EntitlementSummary,
  PlaybackHeartbeatRequest,
  PlaybackHeartbeatResponse,
  PlaybackLeaseView,
  RewardChallengeView,
  UpdateWatchProgressRequest,
  WechatLoginResponse,
  WatchHistoryItem
} from "@microfocus/contracts";

export type AuthSession = WechatLoginResponse;

export interface SearchResponse {
  items: DramaCard[];
  page: number;
  hasMore: boolean;
}

export interface ClientApi {
  authWechat(code: string): Promise<AuthSession>;
  authAnonymous(input: CreateAnonymousSessionRequest): Promise<AnonymousSessionResponse>;
  getCatalog(): Promise<CatalogResponse>;
  search(query: string, category: string, page: number): Promise<SearchResponse>;
  getDrama(id: string): Promise<import("@microfocus/contracts").DramaDetail>;
  getHistory(): Promise<WatchHistoryItem[]>;
  saveProgress(input: UpdateWatchProgressRequest): Promise<void>;
  getEntitlement(dramaId: string): Promise<EntitlementSummary>;
  createRewardChallenge(input: CreateRewardChallengeRequest): Promise<RewardChallengeView>;
  completeRewardChallenge(
    challengeId: string,
    input: CompleteRewardChallengeRequest
  ): Promise<void>;
  createPlaybackLease(input: CreatePlaybackLeaseRequest): Promise<PlaybackLeaseView>;
  heartbeat(
    leaseId: string,
    input: PlaybackHeartbeatRequest
  ): Promise<PlaybackHeartbeatResponse>;
  renewPlaybackLease(leaseId: string): Promise<PlaybackLeaseView>;
  closePlaybackLease(leaseId: string): Promise<void>;
}
