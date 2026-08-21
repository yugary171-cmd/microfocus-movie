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
    mockLabel: "内部体验观看记录"
  },
  收藏: {
    title: "全部收藏",
    empty: "还没有收藏",
    confirm: "确定删除收藏吗？",
    loading: "正在读取收藏…",
    search: "搜索收藏",
    mockLabel: "内部体验收藏"
  },
  点赞: {
    title: "全部点赞",
    empty: "还没有点赞",
    confirm: "确定删除点赞吗？",
    loading: "正在读取点赞…",
    search: "搜索点赞",
    mockLabel: "内部体验点赞"
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
  unread?: boolean;
};

export const INBOX_MOCK_LABEL = "内部体验消息摘要";

export function cloneInboxItems(): InboxItemView[] {
  return INBOX_ITEMS.map((item) => ({ ...item }));
}

function clipInboxPreview(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 36 ? `${text.slice(0, 36)}…` : text;
}

function inboxMeta(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function applyInboxLatest(
  items: InboxItemView[],
  latest: {
    systemPreview?: string;
    systemAt?: string;
    systemUnread?: boolean;
    fansName?: string;
    fansAt?: string;
    commentPreview?: string;
    commentAt?: string;
    minePreview?: string;
    mineAt?: string;
    likeName?: string;
    likeAt?: string;
  }
): InboxItemView[] {
  return items.map((item) => {
    if (item.id === "system") {
      return latest.systemPreview
        ? { ...item, preview: clipInboxPreview(latest.systemPreview), meta: inboxMeta(latest.systemAt), ...(latest.systemUnread !== undefined ? { unread: latest.systemUnread } : {}) }
        : { ...item, ...(latest.systemUnread !== undefined ? { unread: latest.systemUnread } : {}) };
    }
    if (item.id === "fans") {
      return latest.fansName
        ? { ...item, preview: clipInboxPreview(`${latest.fansName} 关注了你`), meta: inboxMeta(latest.fansAt) }
        : { ...item, preview: "暂无粉丝消息", meta: "" };
    }
    if (item.id === "comments") {
      return latest.commentPreview
        ? { ...item, preview: clipInboxPreview(latest.commentPreview), meta: inboxMeta(latest.commentAt) }
        : { ...item, preview: "暂无评论消息", meta: "" };
    }
    if (item.id === "mine") {
      return latest.minePreview
        ? { ...item, preview: clipInboxPreview(latest.minePreview), meta: inboxMeta(latest.mineAt) }
        : { ...item, preview: "暂无我的评论", meta: "" };
    }
    if (item.id === "likes") {
      return latest.likeName
        ? { ...item, preview: clipInboxPreview(`${latest.likeName} 赞了你的评论`), meta: inboxMeta(latest.likeAt) }
        : { ...item, preview: "暂无点赞消息", meta: "" };
    }
    return { ...item };
  });
}

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
