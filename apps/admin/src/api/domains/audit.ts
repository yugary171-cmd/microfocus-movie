import { ADMIN_WEB_PAGE_SIZE, API_ROUTES, normalizeAdminWebPageSize } from "@microfocus/contracts";
import type { AuditLog, PageResult } from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeAuditList, pageTotal } from "../normalizers";

const endpoints = API_ROUTES.admin;

export const auditApi = {
  async listAuditLogs(query = "", page = 1, pageSize = ADMIN_WEB_PAGE_SIZE): Promise<PageResult<AuditLog>> {
    const safePageSize = normalizeAdminWebPageSize(pageSize);
    if (isMockMode) return mockApi.listAuditLogs(query, page, safePageSize);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== ADMIN_WEB_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    const suffix = params.size ? `?${params}` : "";
    const payload = await request<unknown>(`${endpoints.auditLogs}${suffix}`);
    const items = normalizeAuditList(payload);
    return { items, total: pageTotal(payload, items.length) };
  },
};
