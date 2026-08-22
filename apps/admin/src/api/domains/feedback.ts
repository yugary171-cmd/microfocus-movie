import { API_ROUTES, encodedRoute } from "@microfocus/contracts";
import type { AdminFeedbackRecord, FeedbackStatus, PageResult } from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeAdminFeedbackList } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const feedbackApi = {
  async listFeedback(query = "", status = "", page = 1): Promise<PageResult<AdminFeedbackRecord>> {
    if (isMockMode) return mockApi.listFeedback(query, status, page);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    return normalizeAdminFeedbackList(await request<unknown>(`${endpoints.feedback}?${params}`));
  },
  async getFeedback(id: string): Promise<AdminFeedbackRecord> {
    if (isMockMode) return mockApi.getFeedback(id);
    return normalizeAdminFeedbackList({ items: [await request<unknown>(encodedRoute(endpoints.feedbackItem, id))] }).items[0]!;
  },
  async updateFeedback(id: string, input: { status?: FeedbackStatus; internalNote?: string }): Promise<AdminFeedbackRecord> {
    if (isMockMode) return mockApi.updateFeedback(id, input);
    return normalizeAdminFeedbackList({ items: [await request<unknown>(encodedRoute(endpoints.feedbackItem, id), { method: "PATCH", body: json(input) })] }).items[0]!;
  },
  async replyFeedback(id: string, body: string): Promise<void> {
    if (isMockMode) return mockApi.replyFeedback(id, body);
    await request(encodedRoute(endpoints.feedbackReplies, id), { method: "POST", body: json({ body }) });
  },
};
