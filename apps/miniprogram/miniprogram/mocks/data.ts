import {
  ANONYMOUS_VIEWER_TTL_SECONDS,
  DeletionRequestStatus,
  DELETION_QUERY_TOKEN_TTL_SECONDS,
  FREE_EPISODE_COUNT,
  HEARTBEAT_INTERVAL_SECONDS,
  PlaybackLeaseStatus,
  PLAYBACK_TOKEN_TTL_SECONDS,
  type CatalogResponse,
  type DramaDetail,
  type EntitlementSummary,
  type AuthenticatedUser,
  type WatchHistoryItem
} from "@microfocus/contracts";
import { pickDemoVideoUrl } from "../config/demo-media";
import { RUNTIME_CONFIG } from "../config/runtime";
import type { ClientApi, SearchResponse } from "../types/api";
import { applyProfilePatch } from "../utils/profile";
import { readMockProfile, requireMockProfile, writeMockProfile } from "./profile-state";
import { deleteMockHistory, toMockWatchHistoryItems } from "./history-state";

function mockIsFreeEpisodeId(episodeId: string): boolean {
  const matched = /e(\d+)$/.exec(episodeId);
  if (!matched) return false;
  const episodeNumber = Number(matched[1]);
  return episodeNumber >= 1 && episodeNumber <= FREE_EPISODE_COUNT;
}

const dramas: DramaDetail[] = [
  {
    id: "demo-d1",
    title: "归途有星光",
    summary: "城市设计师回到海边故乡，在旧灯塔与亲情之间重新找到方向。",
    coverUrl: "",
    category: "都市",
    tags: ["治愈", "成长"],
    episodeCount: 1,
    recommendationRank: 100,
    licenseNumber: "内部体验备案号：DEMO-001",
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: [{
      id: "demo-d1-e1",
      episodeNumber: 1,
      title: "试播片",
      durationSeconds: 163,
      isFree: true
    }]
  },
  {
    id: "demo-d2",
    title: "合约之外",
    summary: "一份临时合约，让两个坚持原则的人开始重新理解彼此。",
    coverUrl: "",
    category: "甜宠",
    tags: ["轻喜", "职场"],
    episodeCount: 8,
    recommendationRank: 90,
    licenseNumber: "内部体验备案号：DEMO-002",
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: Array.from({ length: 8 }, (_, index) => ({
      id: `demo-d2-e${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 150,
      isFree: index < FREE_EPISODE_COUNT
    }))
  },
  {
    id: "demo-d3",
    title: "山河来信",
    summary: "年轻摄影师沿着祖父的来信，寻找一段被时光珍藏的故事。",
    coverUrl: "",
    category: "年代",
    tags: ["亲情", "悬念"],
    episodeCount: 10,
    recommendationRank: 80,
    licenseNumber: "内部体验备案号：DEMO-003",
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: Array.from({ length: 10 }, (_, index) => ({
      id: `demo-d3-e${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 200,
      isFree: index < FREE_EPISODE_COUNT
    }))
  }
];

const cards = dramas.map(({ rightsHolder: _rightsHolder, episodes: _episodes, ...card }) => card);

const catalog: CatalogResponse = {
  featured: cards.slice(0, 2),
  latest: [...cards].reverse(),
  popular: cards,
  categories: ["全部", "都市", "甜宠", "年代"]
};

const entitlement: EntitlementSummary = {
  dramaId: "demo-d1",
  remainingSeconds: 0,
  nearestExpiresAt: null,
  grants: []
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}

function mockUser(code: string): AuthenticatedUser {
  const id = `internal-user-${code.slice(0, 12)}`;
  const current = readMockProfile();
  if (!current || current.id !== id) {
    return writeMockProfile({
      id,
      displayName: "内部体验用户",
      avatarUrl: null,
      signature: "",
      gender: "unset"
    });
  }
  return current;
}

export const mockApi: ClientApi = {
  authWechat: (code) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) return Promise.reject(new Error("微信登录未返回有效 code"));
    return delay({
      accessToken: `internal-mock-session-${normalizedCode.slice(0, 12)}`,
      user: mockUser(normalizedCode)
    });
  },
  authAnonymous: (input) =>
    delay({
      accessToken: `internal-mock-viewer-${input.sessionId.slice(0, 8)}`,
      expiresAt: new Date(Date.now() + ANONYMOUS_VIEWER_TTL_SECONDS * 1000).toISOString(),
      tokenKind: "viewer" as const
    }),
  getCatalog: () => delay(catalog),
  search: (query, category, page): Promise<SearchResponse> => {
    const normalized = query.trim().toLowerCase();
    const filtered = cards.filter((item) => {
      const categoryMatch = !category || category === "全部" || item.category === category;
      const queryMatch =
        !normalized ||
        item.title.toLowerCase().includes(normalized) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalized));
      return categoryMatch && queryMatch;
    });
    return delay({ items: page === 1 ? filtered : [], page, hasMore: false });
  },
  getDrama: async (id) => {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到这部短剧");
    return delay(drama);
  },
  getHistory: (): Promise<WatchHistoryItem[]> => delay(toMockWatchHistoryItems()),
  deleteHistory: (input) => delay({ deletedDramaIds: deleteMockHistory(input.dramaIds) }),
  getProfile: () => delay({ ...requireMockProfile() }),
  updateProfile: (input) => delay(writeMockProfile(applyProfilePatch(requireMockProfile(), input))),
  saveProgress: () => delay(undefined),
  getEntitlement: (dramaId) => delay({ ...entitlement, dramaId }),
  createRewardChallenge: () =>
    Promise.reject(new Error("内部体验未配置微信广告位，请连接测试环境验证广告流程")),
  completeRewardChallenge: () =>
    Promise.reject(new Error("内部体验不发放真实权益")),
  createPlaybackLease: ({ episodeId }) => {
    const isFree = mockIsFreeEpisodeId(episodeId);
    return delay({
      id: `demo-lease-${episodeId}`,
      episodeId,
      status: PlaybackLeaseStatus.ACTIVE,
      playbackUrl: pickDemoVideoUrl(
        RUNTIME_CONFIG.demoVideoUrls,
        episodeId,
        RUNTIME_CONFIG.demoVideoUrl
      ),
      playbackTokenExpiresAt: new Date(Date.now() + PLAYBACK_TOKEN_TTL_SECONDS * 1000).toISOString(),
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      remainingSeconds: isFree ? null : 0,
      isFree
    });
  },
  getActivePlaybackLease: () =>
    delay({
      lease: null,
      reservations: [],
      unconfirmedCount: 0,
      recoverAction: "none" as const
    }),
  recoverPlaybackLease: () =>
    delay({
      lease: null,
      reservations: [],
      unconfirmedCount: 0,
      recoverAction: "none" as const
    }),
  heartbeat: (_leaseId, request) =>
    delay({
      acknowledgedSeq: request.seq,
      debitedSeconds: 0,
      remainingSeconds: null,
      mayContinue: true
    }),
  renewPlaybackLease: () => Promise.reject(new Error("内部体验没有可续期的播放凭证")),
  closePlaybackLease: () => delay(undefined),
  createDeletionRequest: () =>
    delay({
      deletionRequestId: "demo-deletion",
      status: DeletionRequestStatus.PENDING,
      deletionQueryToken: "demo-query-token",
      tokenExpiresAt: new Date(Date.now() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000).toISOString(),
      replayed: false
    }),
  getDeletionRequest: () =>
    delay({
      deletionRequestId: "demo-deletion",
      status: DeletionRequestStatus.PENDING,
      createdAt: new Date().toISOString(),
      processedAt: null,
      tokenExpiresAt: new Date(Date.now() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000).toISOString(),
      reason: null
    })
};
