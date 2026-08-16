export const INBOX_TAB = "消息";
export const HISTORY_TAB = "历史";
export const FAVORITE_TAB = "收藏";
export const LIKE_TAB = "点赞";

export const LIBRARY_TABS = [HISTORY_TAB, FAVORITE_TAB, LIKE_TAB, INBOX_TAB] as const;

export type LibraryTab = (typeof LIBRARY_TABS)[number];
export type LibraryGridTab = typeof HISTORY_TAB | typeof FAVORITE_TAB | typeof LIKE_TAB;

export function isLibraryTab(value: string): value is LibraryTab {
  return (LIBRARY_TABS as readonly string[]).includes(value);
}

export function isFormatLibraryTab(value: string): value is typeof FAVORITE_TAB | typeof LIKE_TAB {
  return value === FAVORITE_TAB || value === LIKE_TAB;
}

export function parseLibraryGridTab(value: string | undefined): LibraryGridTab {
  if (value === FAVORITE_TAB || value === LIKE_TAB) return value;
  return HISTORY_TAB;
}

export const LIBRARY_EDIT_COPY: Record<
  LibraryGridTab,
  { title: string; empty: string; confirm: string; loading: string; search: string; mockLabel: string }
> = {
  历史: {
    title: "全部历史",
    empty: "还没有观看记录",
    confirm: "确定删除浏览历史吗？",
    loading: "正在读取观看记录…",
    search: "搜索观看记录",
    mockLabel: "Mock 观看记录"
  },
  收藏: {
    title: "全部收藏",
    empty: "还没有收藏",
    confirm: "确定删除收藏吗？",
    loading: "正在读取收藏…",
    search: "搜索收藏",
    mockLabel: "Mock 收藏，不接收藏接口"
  },
  点赞: {
    title: "全部点赞",
    empty: "还没有点赞",
    confirm: "确定删除点赞吗？",
    loading: "正在读取点赞…",
    search: "搜索点赞",
    mockLabel: "Mock 点赞，不接点赞接口"
  }
};

export type InboxTone = "system" | "fans" | "comments" | "mine" | "likes";

export type InboxItemView = {
  id: InboxTone;
  title: string;
  preview: string;
  meta: string;
  icon: string;
  tone: InboxTone;
};

export const INBOX_ITEMS: InboxItemView[] = [
  {
    id: "system",
    title: "系统通知",
    preview: "隐私政策及用户服务协议修订通知",
    meta: "星期一",
    icon: "通",
    tone: "system"
  },
  {
    id: "fans",
    title: "粉丝消息",
    preview: "暂无粉丝消息",
    meta: "",
    icon: "粉",
    tone: "fans"
  },
  {
    id: "comments",
    title: "评论消息",
    preview: "暂无评论消息",
    meta: "",
    icon: "评",
    tone: "comments"
  },
  {
    id: "mine",
    title: "我的评论",
    preview: "暂无我的评论",
    meta: "",
    icon: "我",
    tone: "mine"
  },
  {
    id: "likes",
    title: "赞",
    preview: "暂无点赞消息",
    meta: "",
    icon: "赞",
    tone: "likes"
  }
];
