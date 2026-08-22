import { adminApi } from "@/infrastructure/api/admin";

export const reviewsApi = {
  mode: adminApi.mode,
  listReviews: adminApi.listReviews,
  review: adminApi.review,
} as const;
