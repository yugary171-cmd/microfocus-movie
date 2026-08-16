export const INBOX_TAB = "消息";

export const LIBRARY_TABS = ["历史", "收藏", "点赞", INBOX_TAB] as const;

export type LibraryTab = (typeof LIBRARY_TABS)[number];

export function isLibraryTab(value: string): value is LibraryTab {
  return (LIBRARY_TABS as readonly string[]).includes(value);
}

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
