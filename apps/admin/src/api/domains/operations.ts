import { API_ROUTES, encodedRoute, REWARD_TTL_SECONDS, type ReissueDeletionQueryTokenResponse } from "@microfocus/contracts";
import type {
  AdminCallbackEvent,
  CallbackReplayInput,
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  DeletionQueryTokenReissueInput,
  PageResult,
} from "@/shared/types";
import { isMockMode, request } from "../client";
import { mockApi } from "../mock";
import { normalizeCallbackEventList, normalizeCircuitBreaker } from "../normalizers";

const endpoints = API_ROUTES.admin;
const json = (value: unknown): string => JSON.stringify(value);

export const operationsApi = {
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
