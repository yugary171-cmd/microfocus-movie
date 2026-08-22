import { adminApi } from "@/infrastructure/api/admin";

export const tagsApi = {
  listCatalogTags: adminApi.listCatalogTags,
  createCatalogTag: adminApi.createCatalogTag,
  patchCatalogTag: adminApi.patchCatalogTag,
  getCatalogTag: adminApi.getCatalogTag,
  deleteCatalogTag: adminApi.deleteCatalogTag,
} as const;
