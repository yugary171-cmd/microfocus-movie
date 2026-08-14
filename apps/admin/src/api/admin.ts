import { AdminRole, type ReissueDeletionQueryTokenResponse, type ReleaseGateStatus } from "@microfocus/contracts";
import type {
  AdminSession,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
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
import {
  normalizeAdminSession,
  normalizeAuditList,
  normalizeCircuitBreaker,
  normalizeDashboard,
  normalizeDrama,
  normalizeDramaList,
  normalizeReleaseGate,
  normalizeReviewList,
  normalizeUploadSignature,
} from "./normalizers";

const endpoints = {
  login: "/v1/admin/auth/login",
  dashboard: "/v1/admin/dashboard",
  dramas: "/v1/admin/dramas",
  reviews: "/v1/admin/reviews",
  uploadSign: "/v1/admin/uploads/sign",
  auditLogs: "/v1/admin/audit-logs",
  circuitBreakers: "/v1/admin/circuit-breakers",
  compensate: "/v1/admin/entitlements/compensate",
  adjustments: "/v1/admin/entitlements/adjustments",
  callbackReplay: (eventId: string) => `/v1/admin/callback-events/${eventId}/replay`,
  deletionQueryTokenReissue: (deletionRequestId: string) =>
    `/v1/admin/deletion-requests/${deletionRequestId}/query-tokens`,
  releaseGate: "/v1/admin/release-gate",
} as const;

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
  async listDramas(query = "", status = ""): Promise<PageResult<DramaRecord>> {
    if (isMockMode) return mockApi.listDramas(query, status);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const suffix = params.size ? `?${params}` : "";
    const normalized = normalizeDramaList(await request<unknown>(`${endpoints.dramas}${suffix}`));
    const needle = query.trim().toLowerCase();
    const items = needle
      ? normalized.filter((drama) =>
          [drama.title, drama.ownerName].some((value) => value.toLowerCase().includes(needle)),
        )
      : normalized;
    return { items, total: items.length };
  },
  async getDrama(id: string): Promise<DramaRecord> {
    if (isMockMode) return mockApi.getDrama(id);
    return normalizeDrama(await request<unknown>(`${endpoints.dramas}/${encodeURIComponent(id)}`));
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
    if (!/^[a-f0-9]{64}$/i.test(input.rightsMaterialDigestSha256)) {
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
          recommendationRank: 0,
        }
      : {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          category: input.category,
          tags: input.tags,
          recommendationRank: 0,
          episodes: input.episodes.map((episode) => ({
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            durationSeconds: episode.durationSeconds,
          })),
        };
    const response = await request<unknown>(id ? `${endpoints.dramas}/${encodeURIComponent(id)}` : endpoints.dramas, {
      method: id ? "PATCH" : "POST",
      body: json(body),
    });
    const saved = normalizeDrama(response);
    const dramaId = id || saved.id;
    if (!dramaId) throw new Error("剧目已保存但响应缺少 ID，版权资料未写入");
    await request(`${endpoints.dramas}/${encodeURIComponent(dramaId)}/rights`, {
      method: "POST",
      body: json({
        rightsHolder: input.rightsHolder,
        validFrom: input.rightsValidFrom,
        validUntil: input.licenseExpiresAt,
        territory: "CN",
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
      await request<unknown>(`${endpoints.dramas}/${encodeURIComponent(dramaId)}`),
    );
  },
  submitReview(id: string): Promise<void> {
    if (isMockMode) return mockApi.submitReview(id);
    return request(`${endpoints.dramas}/${encodeURIComponent(id)}/submit-review`, { method: "POST" });
  },
  async listReviews(): Promise<PageResult<ReviewItem>> {
    if (isMockMode) return mockApi.listReviews();
    const items = normalizeReviewList(await request<unknown>(endpoints.reviews));
    return { items, total: items.length };
  },
  review(dramaId: string, reviewId: string, approved: boolean, reason: string): Promise<void> {
    if (isMockMode) return mockApi.review(reviewId, approved, reason);
    return request(`${endpoints.dramas}/${encodeURIComponent(dramaId)}/review`, {
      method: "POST",
      body: json({ status: approved ? "APPROVED" : "REJECTED", notes: reason }),
    });
  },
  publish(id: string): Promise<void> {
    if (isMockMode) return mockApi.publish(id);
    return request(`${endpoints.dramas}/${encodeURIComponent(id)}/publish`, { method: "POST" });
  },
  offline(id: string, reason: string): Promise<void> {
    if (isMockMode) return mockApi.offline(id, reason);
    return request(`${endpoints.dramas}/${encodeURIComponent(id)}/offline`, {
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
    const signature = isMockMode
      ? await mockApi.signUpload(file, dramaId, episodeId)
      : normalizeUploadSignature(
          await request<unknown>(endpoints.uploadSign, {
            method: "POST",
            body: json({
              dramaId,
              episodeId,
              fileName: file.name,
              size: file.size,
              contentType: file.type || "application/octet-stream",
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
  async listAuditLogs(query = ""): Promise<PageResult<AuditLog>> {
    if (isMockMode) return mockApi.listAuditLogs(query);
    const normalized = normalizeAuditList(await request<unknown>(endpoints.auditLogs));
    const needle = query.trim().toLowerCase();
    const items = needle
      ? normalized.filter((item) =>
          [item.actorName, item.action, item.target, item.requestId]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : normalized;
    return { items, total: items.length };
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
    return request(endpoints.callbackReplay(input.eventId), {
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
    return request(endpoints.deletionQueryTokenReissue(input.deletionRequestId), {
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
