import { adminApi } from "@/infrastructure/api/admin";

export const accountsApi = {
  listAccounts: adminApi.listAccounts,
  createAccount: adminApi.createAccount,
  updateAccount: adminApi.updateAccount,
  suspendAccount: adminApi.suspendAccount,
  activateAccount: adminApi.activateAccount,
  createAccountSetupLink: adminApi.createAccountSetupLink,
} as const;
