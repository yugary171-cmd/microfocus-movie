import { API_ROUTES, CatalogTagStatus, encodedRoute, type CatalogTag, type CatalogTagGroupId } from "@microfocus/contracts";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeCatalogTag, normalizeCatalogTagList } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const tagsApi = {
  async listCatalogTags(includeArchived = false): Promise<{ items: CatalogTag[] }> {
    if (isMockMode) return mockApi.listCatalogTags(includeArchived);
    const suffix = includeArchived ? "?includeArchived=1" : "";
    return { items: normalizeCatalogTagList(await request<unknown>(`${endpoints.tags}${suffix}`)) };
  },
  async createCatalogTag(group: CatalogTagGroupId, name: string): Promise<CatalogTag> {
    if (isMockMode) return mockApi.createCatalogTag(group, name);
    const created = normalizeCatalogTag(
      await request<unknown>(endpoints.tags, {
        method: "POST",
        body: json({ group, name }),
      }),
    );
    if (!created) throw new Error("标签已创建但响应缺少记录");
    return created;
  },
  async patchCatalogTag(tagId: string, status: CatalogTagStatus): Promise<CatalogTag> {
    if (isMockMode) return mockApi.patchCatalogTag(tagId, status);
    const updated = normalizeCatalogTag(
      await request<unknown>(encodedRoute(endpoints.tag, tagId), {
        method: "PATCH",
        body: json({ status }),
      }),
    );
    if (!updated) throw new Error("标签已更新但响应缺少记录");
    return updated;
  },
  async getCatalogTag(tagId: string): Promise<CatalogTag> {
    if (isMockMode) return mockApi.getCatalogTag(tagId);
    const tag = normalizeCatalogTag(await request<unknown>(encodedRoute(endpoints.tag, tagId)));
    if (!tag) throw new Error("未找到该标签");
    return tag;
  },
  async deleteCatalogTag(tagId: string, replacementTagId?: string): Promise<void> {
    if (isMockMode) return mockApi.deleteCatalogTag(tagId, replacementTagId);
    await request<unknown>(encodedRoute(endpoints.tag, tagId), {
      method: "DELETE",
      body: json(replacementTagId ? { replacementTagId } : {}),
    });
  },
};
