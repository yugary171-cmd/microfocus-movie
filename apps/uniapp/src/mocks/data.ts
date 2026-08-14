import {
  type CatalogResponse,
  type DramaDetail,
  type EntitlementSummary,
  type PlaybackLeaseView,
  type WatchHistoryItem
} from "@microfocus/contracts";
import { FEED_PAGE_SIZE, HOME_DRAMA_CHANNELS, HOME_RECOMMEND_CHANNEL, PLAYBACK_LEASE_STATUS } from "../constants/runtime";
import { pickDemoVideoUrl } from "../config/demo-media";
import { RUNTIME_CONFIG } from "../config/runtime";
import type { ClientApi, SearchResponse } from "../types/api";
import { matchesHomeChannel } from "../utils/home-channels";
import { paginateItems } from "../utils/pagination";

const dramas: DramaDetail[] = [
  {
    id: "seed-drama-1",
    title: "微焦之城",
    summary: "用于本地开发的短剧样例。",
    coverUrl: "https://images.example.com/micro-light.jpg",
    category: "都市",
    tags: ["都市", "成长"],
    episodeCount: 4,
    recommendationRank: 100,
    licenseNumber: "LOCAL-DEMO-001",
    rightsHolder: "本地开发样例（有效期至 2035-01-01）",
    episodes: Array.from({ length: 4 }, (_, index) => ({
      id: `seed-drama-1-episode-${index + 1}`,
      episodeNumber: index + 1,
      title: `第${index + 1}集`,
      durationSeconds: 120,
      isFree: index < 2
    }))
  },
  {
    id: "demo-d2",
    title: "合约之外",
    summary: "一份临时合约，让两个坚持原则的人开始重新理解彼此。",
    coverUrl: "",
    category: "重生",
    tags: ["重生", "职场"],
    episodeCount: 8,
    recommendationRank: 90,
    licenseNumber: "内部体验备案号：DEMO-002",
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: Array.from({ length: 8 }, (_, index) => ({
      id: `demo-d2-e${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 150,
      isFree: index < 2
    }))
  },
  {
    id: "demo-d3",
    title: "山河来信",
    summary: "年轻摄影师沿着祖父的来信，寻找一段被时光珍藏的故事。",
    coverUrl: "",
    category: "萌宝",
    tags: ["萌宝", "亲情"],
    episodeCount: 10,
    recommendationRank: 80,
    licenseNumber: "内部体验备案号：DEMO-003",
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: Array.from({ length: 10 }, (_, index) => ({
      id: `demo-d3-e${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 200,
      isFree: index < 2
    }))
  },
  ...[
    { id: "demo-d4", title: "归途第一季", category: "重生", tags: ["重生", "悬疑"], episodeCount: 36, rank: 70 },
    { id: "demo-d5", title: "引她入室", category: "甜宠", tags: ["甜宠", "大女主"], episodeCount: 58, rank: 68 },
    { id: "demo-d6", title: "小公主回家", category: "萌宝", tags: ["萌宝", "甜宠"], episodeCount: 72, rank: 66 },
    { id: "demo-d7", title: "十八岁奶奶驾到", category: "宫斗", tags: ["宫斗", "豪门"], episodeCount: 64, rank: 64 },
    { id: "demo-d8", title: "月光落在你肩上", category: "甜宠", tags: ["甜宠", "爱情"], episodeCount: 48, rank: 62 },
    { id: "demo-d9", title: "她的秘密花园", category: "重生", tags: ["重生", "逆袭"], episodeCount: 52, rank: 60 },
    { id: "demo-d10", title: "龙王归来", category: "战神", tags: ["战神", "打脸"], episodeCount: 24, rank: 58 },
    { id: "demo-d11", title: "上门女婿", category: "赘婿", tags: ["赘婿", "逆袭"], episodeCount: 30, rank: 56 },
    { id: "demo-d12", title: "隐世神医", category: "神医", tags: ["神医", "打脸"], episodeCount: 16, rank: 54 }
  ].map((item) => ({
    id: item.id,
    title: item.title,
    summary: "内部体验剧目，用于首页分类与分页加载。",
    coverUrl: "",
    category: item.category,
    tags: item.tags,
    episodeCount: item.episodeCount,
    recommendationRank: item.rank,
    licenseNumber: `内部体验备案号：${item.id.toUpperCase()}`,
    rightsHolder: "内部体验内容（非真实版权信息）",
    episodes: Array.from({ length: Math.min(item.episodeCount, 8) }, (_, index) => ({
      id: `${item.id}-e${index + 1}`,
      episodeNumber: index + 1,
      title: `第 ${index + 1} 集`,
      durationSeconds: 150,
      isFree: index < 2
    }))
  })),
  ...["战神", "赘婿", "甜宠", "重生", "宫斗", "萌宝", "神医", "兵王"].flatMap((category, categoryIndex) =>
    Array.from({ length: 4 }, (_, index) => {
      const n = categoryIndex * 4 + index + 13;
      return {
        id: `demo-d${n}`,
        title: `${category}热播 ${index + 1}`,
        summary: "内部体验剧目，用于首页每页 20 条后继续加载。",
        coverUrl: "",
        category,
        tags: [category],
        episodeCount: 20 + index,
        recommendationRank: 50 - n,
        licenseNumber: `内部体验备案号：DEMO-D${n}`,
        rightsHolder: "内部体验内容（非真实版权信息）",
        episodes: Array.from({ length: 4 }, (_, episodeIndex) => ({
          id: `demo-d${n}-e${episodeIndex + 1}`,
          episodeNumber: episodeIndex + 1,
          title: `第 ${episodeIndex + 1} 集`,
          durationSeconds: 150,
          isFree: episodeIndex < 2
        }))
      };
    })
  )
];

const cards = dramas.map(({ rightsHolder: _rightsHolder, episodes: _episodes, ...card }) => card);

const catalog: CatalogResponse = {
  featured: cards.slice(0, 2),
  latest: [...cards].reverse(),
  popular: cards,
  categories: [HOME_RECOMMEND_CHANNEL, ...HOME_DRAMA_CHANNELS]
};

const entitlement: EntitlementSummary = {
  dramaId: "seed-drama-1",
  remainingSeconds: 0,
  nearestExpiresAt: null,
  grants: []
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 180));
}

export const mockApi: ClientApi = {
  authWechat: (code) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) return Promise.reject(new Error("微信登录未返回有效 code"));
    return delay({
      accessToken: `internal-mock-session-${normalizedCode.slice(0, 12)}`,
      user: {
        id: `internal-user-${normalizedCode.slice(0, 12)}`,
        displayName: "内部体验用户",
        avatarUrl: null
      }
    });
  },
  getCatalog: () => delay(catalog),
  search: (query, category, page): Promise<SearchResponse> => {
    const normalized = query.trim().toLowerCase();
    const filtered = cards.filter((item) => {
      const categoryMatch = matchesHomeChannel(item, category);
      const queryMatch =
        !normalized ||
        item.title.toLowerCase().includes(normalized) ||
        item.summary.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
    return delay(paginateItems(filtered, page, FEED_PAGE_SIZE));
  },
  getDrama: async (id) => {
    const drama = dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到这部短剧");
    return delay(drama);
  },
  getHistory: (): Promise<WatchHistoryItem[]> =>
    delay([
      {
        drama: cards[0]!,
        episodeNumber: 1,
        mediaPositionSeconds: 72,
        updatedAt: new Date().toISOString()
      }
    ]),
  saveProgress: () => delay(undefined),
  getEntitlement: (dramaId) => delay({ ...entitlement, dramaId }),
  createRewardChallenge: () =>
    Promise.reject(new Error("内部体验未配置微信广告位，请连接测试环境验证广告流程")),
  completeRewardChallenge: () =>
    Promise.reject(new Error("内部体验不发放真实权益")),
  createPlaybackLease: async ({ episodeId }) => {
    const drama = dramas.find((item) => item.episodes.some((episode) => episode.id === episodeId));
    const episode = drama?.episodes.find((item) => item.id === episodeId);
    if (!drama || !episode) throw new Error("未找到可播放的剧集");
    const isFree = episode.isFree;
    if (!isFree && (drama.id === entitlement.dramaId ? entitlement.remainingSeconds : 0) <= 0) {
      throw new Error("需要本剧观看时长");
    }
    return delay({
      id: `demo-lease-${episodeId}`,
      episodeId,
      status: PLAYBACK_LEASE_STATUS.ACTIVE as PlaybackLeaseView["status"],
      playbackUrl: pickDemoVideoUrl(
        RUNTIME_CONFIG.demoVideoUrls,
        episodeId,
        RUNTIME_CONFIG.demoVideoUrl
      ),
      playbackTokenExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      heartbeatIntervalSeconds: 5,
      remainingSeconds: isFree ? null : 0,
      isFree
    });
  },
  heartbeat: (_leaseId, request) =>
    delay({
      acknowledgedSeq: request.seq,
      debitedSeconds: 0,
      remainingSeconds: null,
      mayContinue: true
    }),
  renewPlaybackLease: () => Promise.reject(new Error("内部体验没有可续期的播放凭证")),
  closePlaybackLease: () => delay(undefined)
};
