import {
  CatalogTagStatus,
  DramaStatus,
  DRAMA_ADMIN_PAGE_SIZE,
  normalizeDramaAdminPageSize,
  MediaStatus,
  catalogTagNamesById
} from "@microfocus/contracts";
import type {
  DramaInput,
  DramaRecord,
  PosterUploadRefs,
  PageResult,
  UploadSignature
} from "@/shared/types";

import {
  dramaDraftError
} from "@/policies/drama-input";


import {
  state
} from "../state";
import {
  persistMockContent
} from "../storage";
import {
  assertMockEpisodesReady,
  assertMockRights,
  mockDelay,
  paginate,
  writeAudit
} from "../helpers";

export const dramasMockApi = {
  async listDramas(query = "", status = "", page = 1, pageSize = DRAMA_ADMIN_PAGE_SIZE): Promise<PageResult<DramaRecord>> {
    const normalized = query.trim().toLowerCase();
    const items = state.dramas.filter(
      (drama) =>
        (!normalized ||
          drama.title.toLowerCase().includes(normalized) ||
          drama.ownerName.toLowerCase().includes(normalized)) &&
        (!status || drama.status === status),
    );
    return mockDelay(paginate(items, page, normalizeDramaAdminPageSize(pageSize)));
  },
  async getDrama(id: string): Promise<DramaRecord> {
    const drama = state.dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    return mockDelay(drama);
  },
  async saveDrama(input: DramaInput, id?: string, _posterUploads?: PosterUploadRefs): Promise<DramaRecord> {
    const validation = dramaDraftError(
      input,
      new Set(state.catalogTags.filter((tag) => tag.status === CatalogTagStatus.ACTIVE).map((tag) => tag.id)),
    );
    if (validation) throw new Error(validation);
    const existing = id ? state.dramas.find((item) => item.id === id) : undefined;
    const tagIds = [...input.tagIds];
    const saved: DramaRecord = {
      id: existing?.id ?? `drama-${crypto.randomUUID()}`,
      ...input,
      tagIds,
      tags: catalogTagNamesById(tagIds, state.catalogTags),
      status: existing?.status ?? DramaStatus.DRAFT,
      ownerId: existing?.ownerId ?? "editor-1",
      ownerName: existing?.ownerName ?? "林编辑",
      contentApproved: existing?.contentApproved ?? false,
      copyrightVerified: existing?.copyrightVerified ?? false,
      wechatApproved: existing?.wechatApproved ?? false,
      episodes: input.episodes.map((episode) => ({
        ...episode,
        transcodeStatus: episode.mediaStatus === MediaStatus.READY ? "READY" : "PENDING",
        machineReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        manualReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        wechatReviewStatus:
          episode.mediaStatus === MediaStatus.READY ? "APPROVED" : "PENDING",
        updatedAt: new Date().toISOString(),
      })),
      updatedAt: new Date().toISOString(),
    };
    state.dramas = existing
      ? state.dramas.map((item) => (item.id === existing.id ? saved : item))
      : [saved, ...state.dramas];
    writeAudit(state, existing ? "编辑剧目" : "创建剧目", saved.title, "演示数据已保存在当前浏览器中");
    persistMockContent(state);
    return mockDelay(saved);
  },
  async submitReview(id: string): Promise<void> {
    const drama = state.dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    drama.status = DramaStatus.PENDING_REVIEW;
    state.reviews.unshift({
      id: `review-${crypto.randomUUID()}`,
      dramaId: id,
      dramaTitle: drama.title,
      submitterId: drama.ownerId,
      submitterName: drama.ownerName,
      submittedAt: new Date().toISOString(),
      riskFlags: [],
      status: "PENDING",
    });
    writeAudit(state, "提交审核", drama.title, "进入演示审核队列");
    persistMockContent(state);
    return mockDelay(undefined);
  },
  async publish(id: string): Promise<void> {
    const drama = state.dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    if (drama.status !== DramaStatus.READY) throw new Error("剧目尚未审核通过，不能发布");
    if (!drama.contentApproved || !drama.copyrightVerified || !drama.wechatApproved) {
      throw new Error("Mock 发布前请完成内容、版权和微信审核");
    }
    assertMockRights(drama);
    assertMockEpisodesReady(drama);
    drama.status = DramaStatus.PUBLISHED;
    writeAudit(state, "发布剧目", drama.title, "仅更新演示数据，未触发真实发布");
    persistMockContent(state);
    return mockDelay(undefined);
  },
  async offline(id: string, reason: string): Promise<void> {
    const drama = state.dramas.find((item) => item.id === id);
    if (!drama) throw new Error("未找到该剧目");
    drama.status = DramaStatus.OFFLINE;
    writeAudit(state, "下架剧目", drama.title, reason);
    persistMockContent(state);
    return mockDelay(undefined);
  },
  async signUpload(file: File, dramaId: string, episodeId: string): Promise<UploadSignature> {
    writeAudit(state, "签发上传签名", dramaId, `剧集 ${episodeId}`);
    return mockDelay({
      provider: "MOCK",
      uploadUrl: "mock://vod-upload",
      headers: {},
      uploadId: `mock-upload-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      mock: true,
      fileName: file.name.trim(),
      dramaId,
      episodeId,
    } as UploadSignature);
  },
  async uploadCapabilities() {
    return mockDelay({
      posterStorageReady: true,
      vodUploadReady: true,
      reasons: {},
    });
  },
  async uploadPoster(
    dramaId: string,
    kind: "cover" | "promo",
    _file: File,
    onProgress: (value: number) => void,
  ): Promise<{ assetUrl: string; uploadId: string }> {
    for (const progress of [25, 50, 75, 100]) {
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      onProgress(progress);
    }
    return {
      assetUrl: `https://images.example.com/mock/${encodeURIComponent(dramaId)}/${kind}.jpg`,
      uploadId: `mock-poster-${crypto.randomUUID()}`,
    };
  },
};
