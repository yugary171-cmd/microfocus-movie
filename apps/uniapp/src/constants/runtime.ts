/** Runtime values used by the uni-app watch client. */
export const FREE_EPISODE_COUNT = 2;
export const HEARTBEAT_INTERVAL_SECONDS = 5;
export const OFFLINE_GRACE_SECONDS = 15;

export const PLAYBACK_LEASE_STATUS = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  CLOSED: "CLOSED",
  EXPIRED: "EXPIRED"
} as const;

export const FEED_PAGE_SIZE = 20;

export const HOME_RECOMMEND_CHANNEL = "推荐";

export const HOME_DRAMA_CHANNELS = [
  "战神",
  "赘婿",
  "甜宠",
  "重生",
  "宫斗",
  "萌宝",
  "神医",
  "兵王"
] as const;

export const HOME_EXCLUDED_CHANNELS = [
  "社区",
  "电影",
  "听书",
  "小说",
  "漫画",
  "漫剧",
  "真人剧"
] as const;
