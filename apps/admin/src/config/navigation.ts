import { AdminRole } from "@microfocus/contracts";

export interface NavigationItem {
  to: string;
  label: string;
  description: string;
  icon: string;
  roles?: AdminRole[];
}

export const navigationItems: NavigationItem[] = [
  { to: "/", label: "工作台", description: "合规与内容状态", icon: "⌂" },
  { to: "/dramas", label: "剧目管理", description: "元数据、版权与媒体", icon: "▤" },
  {
    to: "/reviews",
    label: "审核队列",
    description: "待审内容与结论",
    icon: "✓",
    roles: [AdminRole.REVIEWER],
  },
  {
    to: "/operations",
    label: "运营控制",
    description: "熔断、补偿、纠错与死信重放",
    icon: "⚙",
    roles: [AdminRole.ADMIN],
  },
  {
    to: "/audit",
    label: "审计日志",
    description: "关键操作留痕",
    icon: "◷",
    roles: [AdminRole.ADMIN],
  },
];
