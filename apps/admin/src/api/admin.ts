import { AdminRole, API_ROUTES, encodedRoute, isRightsMaterialDigest, RECOMMENDATION_RANK_DEFAULT, resolveUploadContentType, REVIEW_NOTES_MAX_LENGTH, RIGHTS_TERRITORY, type ReissueDeletionQueryTokenResponse, type ReleaseGateStatus } from "@microfocus/contracts";
import type {
  AdminSession,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  AdminCallbackEvent,
  CallbackReplayInput,
  DeletionQueryTokenReissueInput,
  DashboardData,
  DramaInput,
  DramaRecord,
  PageResult,
  ReviewItem,
  UploadSignature,
} from "@/types/admin";
import { apiBaseUrl, getSessionToken, isMockMode, request } from "./client";
import { mockApi } from "./mock";
import { uploadFileError } from "@/policies/drama-input";
import {
  normalizeAdminSession,
  normalizeAuditList,
  normalizeCallbackEventList,
  normalizeCircuitBreaker,
  normalizeDashboard,
  normalizeDrama,
  normalizeDramaList,
  normalizeReleaseGate,
  normalizeReviewList,
  normalizeUploadSignature,
  pageTotal,
} from "./normalizers";

const endpoints = API_ROUTES.admin;

const json = (value: unknown): string => JSON.stringify(value);

async function uploadDirect(signature: UploadSignature, file: File, onProgress: (value: number) => void): Promise<void> {
  if (signature.mock || isMockMode) {
    for (const progress of [12, 28, 47, 68, 86, 100]) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      onProgress(progress);
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signature.uploadUrl);
    for (const [key, value] of Object.entries(signature.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`VOD 上传失败（HTTP ${xhr.status}）`));
    });
    xhr.addEventListener("error", () => reject(new Error("VOD 上传网络中断，请重试")));
    xhr.addEventListener("abort", () => reject(new Error("VOD 上传已取消")));
    xhr.send(file);
  });
}

export const adminApi = {
  mode: isMockMode ? "mock" : "live",
  baseUrl: apiBaseUrl,
  hasSession: () => Boolean(getSessionToken()),
  async login(email: string, password: string, otp: string, mockRole: AdminRole): Promise<AdminSession> {
    if (isMockMode) return mockApi.login(email, otp, mockRole);
    const response = await request<unknown>(endpoints.login, {
      method: "POST",
      body: json({ email, password, otp }),
    });
    return normalizeAdminSession(response);
  },
  async dashboard(): Promise<DashboardData> {
    if (isMockMode) return mockApi.dashboard();
    const [dashboard, gate] = await Promise.all([
      request<unknown>(endpoints.dashboard),
      request<unknown>(endpoints.releaseGate),
    ]);
    return normalizeDashboard(dashboard, gate);
  },
  async releaseGate(): Promise<ReleaseGateStatus> {
    if (isMockMode) return mockApi.releaseGate();
    return normalizeReleaseGate(await request<unknown>(endpoints.releaseGate));
  },
  async listDramas(query = "", status = "", page = 1): Promise<PageResult<DramaRecord>> {
    if (isMockMode) return mockApi.listDramas(query, status, page);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const suffix = params.size ? `?${params}` : "";
    const payload = await request<unknown>(`${endpoints.dramas}${suffix}`);
    const items = normalizeDramaList(payload);
    return { items, total: pageTotal(payload, items.length) };
  },
  async getDrama(id: string): Promise<DramaRecord> {
    if (isMockMode) return mockApi.getDrama(id);
    return normalizeDrama(await request<unknown>(encodedRoute(endpoints.drama, id)));
  },
  async saveDrama(input: DramaInput, id?: string): Promise<DramaRecord> {
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
    const missingRights = rightsFields
      .filter((field) => !field.value.trim())
      .map((field) => field.label);
    if (missingRights.length) {
      throw new Error(`真实保存前请补齐版权资料：${missingRights.join("、")}`);
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
      throw new Error("真实保存前必须逐项确认微信分发、广告变现、转码和宣传材料授权");
    }
    if (!id && input.episodes.length === 0) {
      throw new Error("真实创建至少需要一集内容");
    }
    if (
      !id &&
      input.episodes.some(
        (episode) => !episode.title.trim() || episode.durationSeconds < 1,
      )
    ) {
      throw new Error("真实创建前请补齐每集标题，并确保时长至少为 1 秒");
    }
    if (!input.coverUrl) {
      throw new Error("真实保存需要有效的封面 URL");
    }
    const body = id
      ? {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          category: input.category,
          tags: input.tags,
          recommendationRank: RECOMMENDATION_RANK_DEFAULT,
        }
      : {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          category: input.category,
          tags: input.tags,
          recommendationRank: RECOMMENDATION_RANK_DEFAULT,
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
    if (!dramaId) throw new Error("剧目已保存但响应缺少 ID，版权资料未写入");
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
    return normalizeDrama(
      await request<unknown>(encodedRoute(endpoints.drama, dramaId)),
    );
  },
  submitReview(id: string): Promise<void> {
    if (isMockMode) return mockApi.submitReview(id);
    return request(encodedRoute(endpoints.submitReview, id), { method: "POST" });
  },
  async listReviews(page = 1): Promise<PageResult<ReviewItem>> {
    if (isMockMode) return mockApi.listReviews(page);
    const suffix = page > 1 ? `?page=${page}` : "";
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
    if (isMockMode) return mockApi.review(reviewId, approved, notes);
    return request(encodedRoute(endpoints.review, dramaId), {
      method: "POST",
      body: json({
        status: approved ? "APPROVED" : "REJECTED",
        ...(notes ? { notes } : {}),
      }),
    });
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
  ): Promise<void> {
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
    if (!isMockMode) {
      throw new Error(
        "腾讯云 VOD 直传 SDK 与 fileId 注册链路尚未配置，未上传文件。请联系管理员完成 Provider 配置。",
      );
    }
    await uploadDirect(signature, file, onProgress);
  },
  async listAuditLogs(query = "", page = 1): Promise<PageResult<AuditLog>> {
    if (isMockMode) return mockApi.listAuditLogs(query, page);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (page > 1) params.set("page", String(page));
    const suffix = params.size ? `?${params}` : "";
    const payload = await request<unknown>(`${endpoints.auditLogs}${suffix}`);
    const items = normalizeAuditList(payload);
    return { items, total: pageTotal(payload, items.length) };
  },
  async listCallbackEvents(status = "BACKLOG"): Promise<PageResult<AdminCallbackEvent>> {
    if (isMockMode) return mockApi.listCallbackEvents(status);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return normalizeCallbackEventList(
      await request<unknown>(`${endpoints.callbackEvents}?${params}`),
    );
  },
  async getCircuitBreaker(): Promise<CircuitBreakerState> {
    if (isMockMode) return mockApi.getCircuitBreaker();
    return normalizeCircuitBreaker(await request<unknown>(endpoints.circuitBreakers));
  },
  setCircuitBreaker(enabled: boolean, reason: string): Promise<CircuitBreakerState> {
    if (isMockMode) return mockApi.setCircuitBreaker(enabled, reason);
    return request(endpoints.circuitBreakers, {
      method: "PATCH",
      body: json({ enabled, reason }),
    });
  },
  async compensate(input: CompensationInput): Promise<void> {
    if (isMockMode) return mockApi.compensate(input);
    const payload = `${input.userId}\n${input.dramaId}\n${input.seconds}\n${input.reason}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const idempotencyKey = `c:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
    return request(endpoints.compensate, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: json({
        ...input,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      }),
    });
  },
  async adjustEntitlement(input: AdjustmentInput): Promise<void> {
    if (isMockMode) return mockApi.adjustEntitlement(input);
    const payload = `${input.type}\n${input.grantId}\n${input.seconds}\n${input.reason}\n${input.freezeAdjustmentId ?? ""}\n${input.approvalNote ?? ""}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const idempotencyKey = `a:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
    return request(endpoints.adjustments, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: json({
        type: input.type,
        grantId: input.grantId,
        seconds: input.seconds,
        reason: input.reason,
        ...(input.freezeAdjustmentId ? { freezeAdjustmentId: input.freezeAdjustmentId } : {}),
        ...(input.approvalNote ? { approvalNote: input.approvalNote } : {}),
      }),
    });
  },
  async replayCallback(input: CallbackReplayInput): Promise<void> {
    if (isMockMode) return mockApi.replayCallback(input);
    const payload = `${input.eventId}\n${input.reason}\n${input.approvalNote ?? ""}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const idempotencyKey = `r:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
    return request(encodedRoute(endpoints.callbackReplay, input.eventId), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: json({
        reason: input.reason,
        ...(input.approvalNote ? { approvalNote: input.approvalNote } : {}),
      }),
    });
  },
  async reissueDeletionQueryToken(
    input: DeletionQueryTokenReissueInput,
  ): Promise<ReissueDeletionQueryTokenResponse> {
    if (isMockMode) return mockApi.reissueDeletionQueryToken(input);
    const payload = `${input.deletionRequestId}\n${input.userId}\n${input.reason}\n${input.approvalNote}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    const idempotencyKey = `q:${Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
    return request(encodedRoute(endpoints.deletionQueryTokenReissue, input.deletionRequestId), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: json({
        userId: input.userId,
        reason: input.reason,
        approvalNote: input.approvalNote,
      }),
    });
  },
};
