import { AdminRole, API_ROUTES, CatalogTagStatus, encodedRoute, isRightsMaterialDigest, normalizeSystemNotificationAdminPageSize, RECOMMENDATION_RANK_DEFAULT, resolveUploadContentType, REVIEW_NOTES_MAX_LENGTH, REWARD_TTL_SECONDS, RIGHTS_TERRITORY, SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE, type CatalogTag, type CatalogTagGroupId, type ReissueDeletionQueryTokenResponse, type ReleaseGateStatus } from "@microfocus/contracts";
import type {
  AdminSession,
  AdminAccountRecord,
  AdminAccountSetupInfo,
  AdminSetupLink,
  AdminAccountStatus,
  CreateAdminAccountInput,
  UpdateAdminAccountInput,
  SuspendAdminAccountInput,
  ActivateAdminAccountInput,
  CreateAdminSetupLinkInput,
  AuditLog,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  AdminCallbackEvent,
  AdminNotificationRecord,
  AdminFeedbackRecord,
  FeedbackStatus,
  CallbackReplayInput,
  DeletionQueryTokenReissueInput,
  DashboardData,
  DramaInput,
  DramaRecord,
  PageResult,
  ReviewItem,
  UploadSignature,
} from "@/types/admin";
import { apiBaseUrl, getSessionToken, getSessionUser, isMockMode, request } from "./client";
import { mockApi } from "./mock";
import { uploadFileError } from "@/policies/drama-input";
import {
  normalizeAdminSession,
  normalizeAdminAccount,
  normalizeAdminAccountList,
  normalizeAdminAccountSetupInfo,
  normalizeAdminSetupLink,
  normalizeAuditList,
  normalizeAdminNotificationList,
  normalizeAdminFeedbackList,
  normalizeCallbackEventList,
  normalizeCatalogTag,
  normalizeCatalogTagList,
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
  async refresh(): Promise<AdminSession> {
    if (isMockMode) throw new Error("Mock 模式不支持跨标签页会话恢复");
    return normalizeAdminSession(await request<unknown>(endpoints.refresh, {
      method: "POST",
    }, { skipAuthRefresh: true }));
  },
  async logout(): Promise<void> {
    if (isMockMode) return;
    await request<unknown>(endpoints.logout, {
      method: "POST",
    }, { skipAuthRefresh: true });
  },
  async dashboard(): Promise<DashboardData> {
    if (isMockMode) return mockApi.dashboard();
    const [dashboard, gate] = await Promise.all([
      request<unknown>(endpoints.dashboard),
      request<unknown>(endpoints.releaseGate),
    ]);
    return normalizeDashboard(dashboard, gate);
  },
  async listAccounts(
    query = "",
    role: AdminRole | "" = "",
    status: AdminAccountStatus | "" = "",
    page = 1,
  ): Promise<PageResult<AdminAccountRecord>> {
    if (isMockMode) return mockApi.listAccounts(query, role, status, page);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    const suffix = params.size ? `?${params}` : "";
    return normalizeAdminAccountList(await request<unknown>(`${endpoints.accounts}${suffix}`));
  },
  async createAccount(input: CreateAdminAccountInput): Promise<AdminSetupLink> {
    if (isMockMode) return mockApi.createAccount(input);
    return normalizeAdminSetupLink(await request<unknown>(endpoints.accounts, {
      method: "POST",
      body: json(input),
    }));
  },
  async updateAccount(id: string, input: UpdateAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.updateAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.account, id), {
      method: "PATCH",
      body: json(input),
    }));
  },
  async suspendAccount(id: string, input: SuspendAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.suspendAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.accountSuspend, id), {
      method: "POST",
      body: json(input),
    }));
  },
  async activateAccount(id: string, input: ActivateAdminAccountInput): Promise<AdminAccountRecord> {
    if (isMockMode) return mockApi.activateAccount(id, input);
    return normalizeAdminAccount(await request<unknown>(encodedRoute(endpoints.accountActivate, id), {
      method: "POST",
      body: json(input),
    }));
  },
  async createAccountSetupLink(id: string, input: CreateAdminSetupLinkInput): Promise<AdminSetupLink> {
    if (isMockMode) return mockApi.createAccountSetupLink(id, input);
    return normalizeAdminSetupLink(await request<unknown>(encodedRoute(endpoints.accountSetupLinks, id), {
      method: "POST",
      body: json(input),
    }));
  },
  async inspectAccountSetup(token: string): Promise<AdminAccountSetupInfo> {
    if (isMockMode) return mockApi.inspectAccountSetup(token);
    return normalizeAdminAccountSetupInfo(await request<unknown>(endpoints.setupInspect, {
      method: "POST",
      body: json({ token }),
    }));
  },
  async completeAccountSetup(token: string, password: string, otp: string): Promise<void> {
    if (isMockMode) return mockApi.completeAccountSetup(token, password, otp);
    await request(endpoints.setupComplete, {
      method: "POST",
      body: json({ token, password, otp }),
    });
  },
  async releaseGate(): Promise<ReleaseGateStatus> {
    if (isMockMode) return mockApi.releaseGate();
    return normalizeReleaseGate(await request<unknown>(endpoints.releaseGate));
  },
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
          category: input.category,
          tags: input.tagIds,
          recommendationRank: RECOMMENDATION_RANK_DEFAULT,
        }
      : {
          title: input.title,
          summary: input.summary,
          coverUrl: input.coverUrl,
          category: input.category,
          tags: input.tagIds,
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
  async listReviews(page = 1): Promise<PageResult<ReviewItem>> {
    if (isMockMode) return mockApi.listReviews(page, getSessionUser());
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
    if (isMockMode) return mockApi.review(reviewId, approved, notes, getSessionUser());
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
  async listNotifications(query = "", status = "", page = 1, pageSize = SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE): Promise<PageResult<AdminNotificationRecord>> {
    const safePageSize = normalizeSystemNotificationAdminPageSize(pageSize);
    if (isMockMode) return mockApi.listNotifications(query, status, page, safePageSize);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    if (safePageSize !== SYSTEM_NOTIFICATION_ADMIN_PAGE_SIZE) params.set("pageSize", String(safePageSize));
    return normalizeAdminNotificationList(await request<unknown>(`${endpoints.notifications}?${params}`));
  },
  async getNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.getNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notification, id))] }).items[0]!;
  },
  async createNotification(title: string, body: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.createNotification(title, body);
    return normalizeAdminNotificationList({ items: [await request<unknown>(endpoints.notifications, { method: "POST", body: json({ title, body }) })] }).items[0]!;
  },
  async updateNotification(id: string, input: { title?: string; body?: string }): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.updateNotification(id, input);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notification, id), { method: "PATCH", body: json(input) })] }).items[0]!;
  },
  async deleteNotification(id: string): Promise<void> {
    if (isMockMode) return mockApi.deleteNotification(id);
    await request(encodedRoute(endpoints.notificationDelete, id), { method: "DELETE" });
  },
  async publishNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.publishNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notificationPublish, id), { method: "POST" })] }).items[0]!;
  },
  async retractNotification(id: string): Promise<AdminNotificationRecord> {
    if (isMockMode) return mockApi.retractNotification(id);
    return normalizeAdminNotificationList({ items: [await request<unknown>(encodedRoute(endpoints.notificationRetract, id), { method: "POST" })] }).items[0]!;
  },
  async listFeedback(query = "", status = "", page = 1): Promise<PageResult<AdminFeedbackRecord>> {
    if (isMockMode) return mockApi.listFeedback(query, status, page);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    if (page > 1) params.set("page", String(page));
    return normalizeAdminFeedbackList(await request<unknown>(`${endpoints.feedback}?${params}`));
  },
  async getFeedback(id: string): Promise<AdminFeedbackRecord> {
    if (isMockMode) return mockApi.getFeedback(id);
    return normalizeAdminFeedbackList({ items: [await request<unknown>(encodedRoute(endpoints.feedbackItem, id))] }).items[0]!;
  },
  async updateFeedback(id: string, input: { status?: FeedbackStatus; internalNote?: string }): Promise<AdminFeedbackRecord> {
    if (isMockMode) return mockApi.updateFeedback(id, input);
    return normalizeAdminFeedbackList({ items: [await request<unknown>(encodedRoute(endpoints.feedbackItem, id), { method: "PATCH", body: json(input) })] }).items[0]!;
  },
  async replyFeedback(id: string, body: string): Promise<void> {
    if (isMockMode) return mockApi.replyFeedback(id, body);
    await request(encodedRoute(endpoints.feedbackReplies, id), { method: "POST", body: json({ body }) });
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
        expiresAt: new Date(Date.now() + REWARD_TTL_SECONDS * 1_000).toISOString(),
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
