import {
  API_ROUTES,
  DRAMA_ADMIN_PAGE_SIZE,
  encodedRoute,
  isRightsMaterialDigest,
  normalizeDramaAdminPageSize,
  RECOMMENDATION_RANK_DEFAULT,
  resolveUploadContentType,
  RIGHTS_TERRITORY,
  type PosterUploadKind,
  type ReleaseGateStatus,
} from "@microfocus/contracts";
import type {
  DramaInput,
  DramaRecord,
  PageResult,
  PosterUploadRefs,
} from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { uploadFileError } from "@/policies/drama-input";
import {
  normalizeDrama,
  normalizeDramaList,
  normalizePosterUpload,
  normalizeReleaseGate,
  normalizeUploadCapabilities,
  normalizeUploadSignature,
  pageTotal,
} from "../normalizers";
import { uploadDirect, uploadObject } from "../shared/upload";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const dramasApi = {
  async releaseGate(): Promise<ReleaseGateStatus> {
    if (isMockMode) return mockApi.releaseGate();
    return normalizeReleaseGate(await request<unknown>(endpoints.releaseGate));
  },
  async uploadCapabilities() {
    if (isMockMode) return mockApi.uploadCapabilities();
    return normalizeUploadCapabilities(await request<unknown>(endpoints.uploadCapabilities));
  },
  async listDramas(query = "", status = "", page = 1, pageSize = DRAMA_ADMIN_PAGE_SIZE): Promise<PageResult<DramaRecord>> {
    const safePageSize = normalizeDramaAdminPageSize(pageSize);
    if (isMockMode) return mockApi.listDramas(query, status, page, safePageSize);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== DRAMA_ADMIN_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    const suffix = params.size ? `?${params}` : "";
    const payload = await request<unknown>(`${endpoints.dramas}${suffix}`);
    const items = normalizeDramaList(payload);
    return { items, total: pageTotal(payload, items.length) };
  },
  async getDrama(id: string): Promise<DramaRecord> {
    if (isMockMode) return mockApi.getDrama(id);
    return normalizeDrama(await request<unknown>(encodedRoute(endpoints.drama, id)));
  },
  async uploadPoster(
    dramaId: string,
    kind: PosterUploadKind,
    file: File,
    onProgress: (value: number) => void,
  ): Promise<{ assetUrl: string; uploadId: string }> {
    if (isMockMode) return mockApi.uploadPoster(dramaId, kind, file, onProgress);
    const authorization = normalizePosterUpload(
      await request<unknown>(endpoints.posterUploadSign, {
        method: "POST",
        body: json({
          ...(dramaId ? { dramaId } : {}),
          kind,
          fileName: file.name.trim(),
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      }),
    );
    await uploadObject(authorization, file, onProgress);
    const completed = await request<unknown>(endpoints.posterUploadComplete, {
      method: "POST",
      body: json({ uploadId: authorization.uploadId }),
    });
    const assetUrl = typeof completed === "object" && completed !== null && "assetUrl" in completed
      ? (completed as { assetUrl?: unknown }).assetUrl
      : undefined;
    if (typeof assetUrl !== "string" || !assetUrl) throw new Error("海报上传完成但未返回访问地址");
    return { assetUrl, uploadId: authorization.uploadId };
  },
  async saveDrama(input: DramaInput, id?: string, posterUploads: PosterUploadRefs = {}): Promise<DramaRecord> {
    if (isMockMode) return mockApi.saveDrama(input, id);
    const rightsFields: Array<{ value: string; label: string }> = [
      { value: input.rightsHolder, label: "权利方" },
      { value: input.licenseNumber, label: "许可编号" },
      { value: input.rightsValidFrom, label: "许可起始日" },
      { value: input.licenseExpiresAt, label: "许可到期日" },
      { value: input.rightsReportNumber, label: "报备号" },
      { value: input.rightsMaterialObjectKey, label: "材料对象键" },
      { value: input.rightsMaterialDigestSha256, label: "材料 SHA-256" },
    ];
    const hasRightsDraft =
      rightsFields.some((field) => field.value.trim()) ||
      input.allowsWechatDistribution ||
      input.allowsAdMonetization ||
      input.allowsTranscoding ||
      input.allowsPromotionalMaterial;
    if (hasRightsDraft) {
      const missingRights = rightsFields
        .filter((field) => !field.value.trim())
        .map((field) => field.label);
      if (missingRights.length) {
        throw new Error(`保存版权资料前请补齐：${missingRights.join("、")}`);
      }
      if (!isRightsMaterialDigest(input.rightsMaterialDigestSha256)) {
        throw new Error("材料 SHA-256 必须是 64 位十六进制摘要");
      }
      if (
        !input.allowsWechatDistribution ||
        !input.allowsAdMonetization ||
        !input.allowsTranscoding ||
        !input.allowsPromotionalMaterial
      ) {
        throw new Error("填写版权时必须逐项确认微信分发、广告变现、转码和宣传材料授权");
      }
    }
    if (!id && input.episodes.length === 0) {
      throw new Error("真实创建至少需要一集内容");
    }
    if (!id && input.episodes.some((episode) => episode.durationSeconds < 1)) {
      throw new Error("真实创建前请确保每集时长至少为 1 秒");
    }
    if (!input.coverUrl) {
      throw new Error("真实保存需要有效的封面 URL");
    }
    const body = id
      ? {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          promoCoverUrl: input.promoCoverUrl || undefined,
          category: input.category,
          tags: input.tagIds,
          recommendationRank: RECOMMENDATION_RANK_DEFAULT,
          ...(posterUploads.coverUploadId ? { coverUploadId: posterUploads.coverUploadId } : {}),
          ...(posterUploads.promoUploadId ? { promoUploadId: posterUploads.promoUploadId } : {}),
        }
      : {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          promoCoverUrl: input.promoCoverUrl || undefined,
          category: input.category,
          tags: input.tagIds,
          recommendationRank: RECOMMENDATION_RANK_DEFAULT,
          ...(posterUploads.coverUploadId ? { coverUploadId: posterUploads.coverUploadId } : {}),
          ...(posterUploads.promoUploadId ? { promoUploadId: posterUploads.promoUploadId } : {}),
          episodes: input.episodes.map((episode) => ({
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            durationSeconds: episode.durationSeconds,
          })),
        };
    const response = await request<unknown>(id ? encodedRoute(endpoints.drama, id) : endpoints.dramas, {
      method: id ? "PATCH" : "POST",
      body: json(body),
    });
    const saved = normalizeDrama(response);
    const dramaId = id || saved.id;
    if (!dramaId) throw new Error("剧目已保存但响应缺少 ID");
    if (hasRightsDraft) {
      await request(encodedRoute(endpoints.rights, dramaId), {
        method: "POST",
        body: json({
          rightsHolder: input.rightsHolder,
          validFrom: input.rightsValidFrom,
          validUntil: input.licenseExpiresAt,
          territory: RIGHTS_TERRITORY,
          allowsWechatDistribution: input.allowsWechatDistribution,
          allowsAdMonetization: input.allowsAdMonetization,
          allowsTranscoding: input.allowsTranscoding,
          allowsPromotionalMaterial: input.allowsPromotionalMaterial,
          licenseNumber: input.licenseNumber,
          reportNumber: input.rightsReportNumber,
          materialObjectKey: input.rightsMaterialObjectKey,
          materialDigestSha256: input.rightsMaterialDigestSha256,
        }),
      });
    }
    return normalizeDrama(
      await request<unknown>(encodedRoute(endpoints.drama, dramaId)),
    );
  },
  submitReview(id: string): Promise<void> {
    if (isMockMode) return mockApi.submitReview(id);
    return request(encodedRoute(endpoints.submitReview, id), { method: "POST" });
  },
  publish(id: string): Promise<void> {
    if (isMockMode) return mockApi.publish(id);
    return request(encodedRoute(endpoints.publish, id), { method: "POST" });
  },
  offline(id: string, reason: string): Promise<void> {
    if (isMockMode) return mockApi.offline(id, reason);
    return request(encodedRoute(endpoints.offline, id), {
      method: "POST",
      body: json({ reason }),
    });
  },
  async uploadEpisode(
    dramaId: string,
    episodeId: string,
    file: File,
    onProgress: (value: number) => void,
  ): Promise<{ fileId: string }> {
    const fileError = uploadFileError(file);
    if (fileError) throw new Error(fileError);
    const fileName = file.name.trim();
    const contentType = resolveUploadContentType(file.type);
    if (!contentType) throw new Error("仅支持 MP4、MOV、WebM 视频文件");
    const signature = isMockMode
      ? await mockApi.signUpload(file, dramaId, episodeId)
      : normalizeUploadSignature(
          await request<unknown>(endpoints.uploadSign, {
            method: "POST",
            body: json({
              dramaId,
              episodeId,
              fileName,
              size: file.size,
              contentType,
            }),
          }),
        );
    const fileId = await uploadDirect(signature, file, onProgress);
    if (!isMockMode) {
      await request<unknown>(encodedRoute(endpoints.mediaAssets, dramaId), {
        method: "POST",
        body: json({ episodeId, fileId, uploadId: signature.uploadId }),
      });
    }
    return { fileId };
  },
};
