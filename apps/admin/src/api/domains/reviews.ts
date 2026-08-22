import {
  ADMIN_WEB_PAGE_SIZE,
  API_ROUTES,
  encodedRoute,
  normalizeAdminWebPageSize,
  REVIEW_NOTES_MAX_LENGTH,
} from "@microfocus/contracts";
import type { PageResult, ReviewItem } from "@/shared/types";
import { getSessionUser, isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeReviewList, pageTotal } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const reviewsApi = {
  async listReviews(page = 1, pageSize = ADMIN_WEB_PAGE_SIZE): Promise<PageResult<ReviewItem>> {
    const safePageSize = normalizeAdminWebPageSize(pageSize);
    if (isMockMode) return mockApi.listReviews(page, getSessionUser(), safePageSize);
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== ADMIN_WEB_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    const suffix = params.size ? `?${params}` : "";
    const payload = await request<unknown>(`${endpoints.reviews}${suffix}`);
    const items = normalizeReviewList(payload);
    return { items, total: pageTotal(payload, items.length) };
  },
  review(dramaId: string, reviewId: string, approved: boolean, reason: string): Promise<void> {
    const notes = reason.trim();
    if (notes.length > REVIEW_NOTES_MAX_LENGTH) {
      return Promise.reject(new Error(`审核说明不能超过 ${REVIEW_NOTES_MAX_LENGTH} 字`));
    }
    if (!approved && !notes) {
      return Promise.reject(new Error("请填写退回原因"));
    }
    if (isMockMode) return mockApi.review(reviewId, approved, notes, getSessionUser());
    return request(encodedRoute(endpoints.review, dramaId), {
      method: "POST",
      body: json({
        status: approved ? "APPROVED" : "REJECTED",
        ...(notes ? { notes } : {}),
      }),
    });
  },
};
