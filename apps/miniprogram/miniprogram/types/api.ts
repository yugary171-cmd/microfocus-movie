import type {
  AnonymousSessionResponse,
  AuthenticatedUser,
  CatalogResponse,
  CompleteRewardChallengeRequest,
  CreateAnonymousSessionRequest,
  CreateDeletionRequest,
  CreateDeletionRequestResponse,
  CreatePlaybackLeaseRequest,
  CreateRewardChallengeRequest,
  DeletionRequestView,
  DramaCard,
  EntitlementSummary,
  ActivePlaybackLeaseResponse,
  PlaybackHeartbeatRequest,
  PlaybackHeartbeatResponse,
  PlaybackLeaseView,
  RecoverPlaybackLeaseRequest,
  RewardChallengeView,
  UpdateUserProfileRequest,
  UpdateWatchProgressRequest,
  WechatLoginResponse,
  WatchHistoryItem,
  DeleteWatchHistoryRequest,
  DeleteWatchHistoryResponse
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
  deleteHistory(input: DeleteWatchHistoryRequest): Promise<DeleteWatchHistoryResponse>;
  getProfile(): Promise<AuthenticatedUser>;
  updateProfile(input: UpdateUserProfileRequest): Promise<AuthenticatedUser>;
  saveProgress(input: UpdateWatchProgressRequest): Promise<void>;
  getEntitlement(dramaId: string): Promise<EntitlementSummary>;
  createRewardChallenge(input: CreateRewardChallengeRequest): Promise<RewardChallengeView>;
  completeRewardChallenge(
    challengeId: string,
    input: CompleteRewardChallengeRequest
  ): Promise<void>;
  createPlaybackLease(input: CreatePlaybackLeaseRequest): Promise<PlaybackLeaseView>;
  getActivePlaybackLease(): Promise<ActivePlaybackLeaseResponse>;
  recoverPlaybackLease(
    leaseId: string,
    input: RecoverPlaybackLeaseRequest
  ): Promise<ActivePlaybackLeaseResponse>;
  heartbeat(
    leaseId: string,
    input: PlaybackHeartbeatRequest
  ): Promise<PlaybackHeartbeatResponse>;
  renewPlaybackLease(leaseId: string): Promise<PlaybackLeaseView>;
  closePlaybackLease(leaseId: string): Promise<void>;
  createDeletionRequest(input: CreateDeletionRequest): Promise<CreateDeletionRequestResponse>;
  getDeletionRequest(deletionRequestId: string, queryToken: string): Promise<DeletionRequestView>;
}
