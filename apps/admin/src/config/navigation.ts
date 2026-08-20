import { AdminRole } from "@microfocus/contracts";

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: "home" | "grid" | "circle-check" | "settings" | "clock" | "users";
  roles?: AdminRole[];
}

export const navigationItems: NavigationItem[] = [
  { to: "/", label: "工作台", description: "合规与内容状态", icon: "home" },
  { to: "/dramas", label: "剧目管理", description: "元数据、版权与媒体", icon: "grid" },
  {
    to: "/reviews",
    label: "审核队列",
    description: "待审内容与结论",
    icon: "circle-check",
  },
  {
    to: "/operations",
    label: "运营控制",
    description: "熔断、补偿、纠错、死信重放与注销令牌补发",
    icon: "settings",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/audit",
    label: "审计日志",
    description: "关键操作留痕",
    icon: "clock",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/accounts",
    label: "账号管理",
    description: "管理员、角色与开通",
    icon: "users",
    roles: [AdminRole.ADMIN],
  },
];

export function isNavigationItemActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}
