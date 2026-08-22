import { adminApi } from "@/infrastructure/api/admin";

export const dramasApi = {
  mode: adminApi.mode,
  getDrama: adminApi.getDrama,
  listDramas: adminApi.listDramas,
  listCatalogTags: adminApi.listCatalogTags,
  uploadCapabilities: adminApi.uploadCapabilities,
  releaseGate: adminApi.releaseGate,
  uploadPoster: adminApi.uploadPoster,
  uploadEpisode: adminApi.uploadEpisode,
  saveDrama: adminApi.saveDrama,
  submitReview: adminApi.submitReview,
  publish: adminApi.publish,
  offline: adminApi.offline,
} as const;
