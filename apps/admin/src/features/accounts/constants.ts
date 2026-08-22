import { AdminAccountStatus } from "@microfocus/contracts";

export const accountFilterPlaceholders = {
  query: "姓名或登录名",
  role: "全部账号角色",
  status: "全部账号状态",
} as const;

export const accountStatusLabels: Record<AdminAccountStatus, string> = {
  [AdminAccountStatus.PENDING_SETUP]: "待开通",
  [AdminAccountStatus.ACTIVE]: "正常",
  [AdminAccountStatus.SUSPENDED]: "已停用",
};

export const accountActionMessages = {
  created: "账号已创建，等待本人完成开通。",
  updated: "账号资料已更新；角色变化会要求目标账号重新登录。",
  suspended: "账号已停用，旧会话将立即失效。",
  activated: "账号已启用，将继续使用原登录凭据。",
  setupLinkCreated: "新的开通链接已生成，旧链接已失效。",
  resetCompleted: "目标账号已暂停，旧会话和原凭据已失效。",
  copyLoginFailed: "浏览器未允许复制，请手动选择登录名复制",
  copyLinkFailed: "浏览器未允许复制，请手动选择链接复制",
} as const;
