export const SEARCH_PLACEHOLDER = "我的26岁女房客";

export const SEARCH_SHORTCUTS = [
  { id: "rank", label: "排行", tone: "orange" },
  { id: "new", label: "上新", tone: "teal" },
  { id: "actor", label: "演员", tone: "gold" },
  { id: "filter", label: "筛选", tone: "blue" }
] as const;

export type SearchShortcutId = (typeof SEARCH_SHORTCUTS)[number]["id"];

/** Local discovery copy only. Not a ranking API and must not include 识剧 / 话题榜. */
export const SEARCH_GUESS_POOL = [
  "都重生了，谁还装富二代啊",
  "万妖图录传第一季",
  "我的26岁女房客",
  "皇后娘娘来打工",
  "她在月光下失忆",
  "再考公",
  "战神归来",
  "赘婿逆袭",
  "甜宠日常",
  "宫斗翻盘",
  "萌宝来报恩",
  "神医下山"
] as const;
