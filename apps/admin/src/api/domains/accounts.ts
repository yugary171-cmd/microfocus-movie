import { AdminRole, ADMIN_WEB_PAGE_SIZE, API_ROUTES, encodedRoute, normalizeAdminWebPageSize } from "@microfocus/contracts";
import type {
  AdminAccountRecord,
  AdminAccountStatus,
  AdminSetupLink,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
  SuspendAdminAccountInput,
  ActivateAdminAccountInput,
  CreateAdminSetupLinkInput,
  PageResult,
} from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import {
  normalizeAdminAccount,
  normalizeAdminAccountList,
  normalizeAdminSetupLink,
} from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const accountsApi = {
  async listAccounts(
    query = "",
    role: AdminRole | "" = "",
    status: AdminAccountStatus | "" = "",
    page = 1,
    pageSize = ADMIN_WEB_PAGE_SIZE,
  ): Promise<PageResult<AdminAccountRecord>> {
    const safePageSize = normalizeAdminWebPageSize(pageSize);
    if (isMockMode) return mockApi.listAccounts(query, role, status, page, safePageSize);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== ADMIN_WEB_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    const suffix = params.size ? `?${params}` : "";
    return normalizeAdminAccountList(await request<unknown>(`${endpoints.accounts}${suffix}`));
  },
  async createAccount(input: CreateAdminAccountInput): Promise<AdminSetupLink> {
    if (isMockMode) return mockApi.createAccount(input);
    return normalizeAdminSetupLink(await request<unknown>(endpoints.accounts, {
      method: "POST",
      body: json(input),
    }));
  },
  async updateAccount(id: string, input: UpdateAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.updateAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.account, id), {
      method: "PATCH",
      body: json(input),
    }));
  },
  async suspendAccount(id: string, input: SuspendAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.suspendAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.accountSuspend, id), {
      method: "POST",
      body: json(input),
    }));
  },
  async activateAccount(id: string, input: ActivateAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.activateAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.accountActivate, id), {
      method: "POST",
      body: json(input),
    }));
  },
  async createAccountSetupLink(id: string, input: CreateAdminSetupLinkInput): Promise<AdminSetupLink> {
    if (isMockMode) return mockApi.createAccountSetupLink(id, input);
    return normalizeAdminSetupLink(await request<unknown>(encodedRoute(endpoints.accountSetupLinks, id), {
      method: "POST",
      body: json(input),
    }));
  },
};
