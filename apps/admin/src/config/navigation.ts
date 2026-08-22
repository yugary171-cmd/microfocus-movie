import { AdminRole } from "@microfocus/contracts";

export type NavigationIcon =
  | "home"
  | "dramas"
  | "reviews"
  | "tags"
  | "operations"
  | "audit"
  | "notifications"
  | "feedback"
  | "accounts";

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: NavigationIcon;
  roles?: AdminRole[];
}

export const navigationItems: NavigationItem[] = [
  { to: "/", label: "工作台", description: "合规与内容状态", icon: "home" },
  { to: "/dramas", label: "剧目管理", description: "元数据、版权与媒体", icon: "dramas" },
  {
    to: "/reviews",
    label: "审核队列",
    description: "待审内容与结论",
    icon: "reviews",
  },
  {
    to: "/tags",
    label: "标签库",
    description: "维护启用词与分组",
    icon: "tags",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/operations",
    label: "运营控制",
    description: "熔断、补偿、纠错、死信重放与注销令牌补发",
    icon: "operations",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/audit",
    label: "审计日志",
    description: "关键操作留痕",
    icon: "audit",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/notifications",
    label: "系统通知",
    description: "发布全量公告",
    icon: "notifications",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/feedback",
    label: "用户反馈",
    description: "处理用户意见",
    icon: "feedback",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/accounts",
    label: "账号管理",
    description: "管理员、角色与开通",
    icon: "accounts",
    roles: [AdminRole.ADMIN],
  },
];

export function isNavigationItemActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}
