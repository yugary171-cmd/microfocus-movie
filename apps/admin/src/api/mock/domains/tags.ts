import {
  CatalogTagStatus,
  isCatalogTagGroupId,
  normalizeCatalogTagName,
  catalogTagNamesById,
  replaceStoredTagId,
  type CatalogTag,
  type CatalogTagGroupId
} from "@microfocus/contracts";





import {
  state
} from "../state";
import {
  persistMockContent,
  persistMockTags
} from "../storage";
import {
  dramaTagIds,
  dramaUsesCatalogTag,
  mockDelay,
  writeAudit
} from "../helpers";

export const tagsMockApi = {
  async listCatalogTags(includeArchived = false): Promise<{ items: CatalogTag[] }> {
    const items = includeArchived
      ? state.catalogTags
      : state.catalogTags.filter((tag) => tag.status === CatalogTagStatus.ACTIVE);
    return mockDelay({ items: [...items] });
  },
  async createCatalogTag(group: CatalogTagGroupId, name: string): Promise<CatalogTag> {
    const normalized = normalizeCatalogTagName(name);
    if (!normalized) throw new Error("请填写标签名称");
    if (!isCatalogTagGroupId(group)) throw new Error("请选择标签分组");
    if (state.catalogTags.some((tag) => tag.group === group && tag.name === normalized)) {
      throw new Error("同一分组内已有相同标签");
    }
    const maxOrder = state.catalogTags
      .filter((tag) => tag.group === group)
      .reduce((max, tag) => Math.max(max, tag.sortOrder), -1);
    const created: CatalogTag = {
      id: `ctag-${crypto.randomUUID()}`,
      group,
      name: normalized,
      status: CatalogTagStatus.ACTIVE,
      sortOrder: maxOrder + 1,
    };
    state.catalogTags = [...state.catalogTags, created];
    persistMockTags(state);
    writeAudit(state, "新增标签", created.name, created.group);
    return mockDelay(created);
  },
  async patchCatalogTag(tagId: string, status: CatalogTagStatus): Promise<CatalogTag> {
    const existing = state.catalogTags.find((tag) => tag.id === tagId);
    if (!existing) throw new Error("未找到该标签");
    existing.status = status;
    persistMockTags(state);
    writeAudit(state, status === CatalogTagStatus.ARCHIVED ? "停用标签" : "启用标签", existing.name, existing.group);
    return mockDelay({ ...existing });
  },
  async getCatalogTag(tagId: string): Promise<CatalogTag> {
    const existing = state.catalogTags.find((tag) => tag.id === tagId);
    if (!existing) throw new Error("未找到该标签");
    return mockDelay({
      ...existing,
      usageCount: state.dramas.filter((drama) => dramaUsesCatalogTag(state, drama, tagId)).length,
    });
  },
  async deleteCatalogTag(tagId: string, replacementTagId?: string): Promise<void> {
    const existing = state.catalogTags.find((tag) => tag.id === tagId);
    if (!existing) throw new Error("未找到该标签");
    const referencing = state.dramas.filter((drama) => dramaUsesCatalogTag(state, drama, tagId));
    const replacementId = replacementTagId?.trim() ?? "";
    if (referencing.length && !replacementId) {
      throw new Error("该标签已被剧目使用，请选择替换标签后再删除");
    }
    if (replacementId) {
      const replacement = state.catalogTags.find((tag) => tag.id === replacementId);
      if (!replacement || replacement.id === tagId || replacement.status !== CatalogTagStatus.ACTIVE || replacement.group !== existing.group) {
        throw new Error("替换标签必须是同一分组的其他启用词");
      }
      state.dramas = state.dramas.map((drama) => {
        if (!dramaUsesCatalogTag(state, drama, tagId)) return drama;
        const tagIds = replaceStoredTagId(dramaTagIds(state, drama), tagId, replacementId);
        return {
          ...drama,
          tagIds,
          tags: catalogTagNamesById(tagIds, state.catalogTags),
        };
      });
    }
    state.catalogTags = state.catalogTags.filter((tag) => tag.id !== tagId);
    persistMockTags(state);
    persistMockContent(state);
    writeAudit(state, "删除标签", existing.name, replacementId || existing.group);
  },
};
