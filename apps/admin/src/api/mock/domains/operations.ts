import {
  CALLBACK_MAX_ATTEMPTS,
  DeletionRequestStatus,
  DELETION_QUERY_TOKEN_TTL_SECONDS,
  type ReissueDeletionQueryTokenResponse
} from "@microfocus/contracts";
import type {
  CircuitBreakerState,
  CompensationInput,
  AdjustmentInput,
  CallbackReplayInput,
  DeletionQueryTokenReissueInput,
  PageResult,
  AdminCallbackEvent
} from "@/shared/types";



import {
  isoHoursAgo
} from "../fixtures";
import {
  state
} from "../state";

import {
  mockDelay,
  writeAudit
} from "../helpers";

export const operationsMockApi = {
  async getCircuitBreaker(): Promise<CircuitBreakerState> {
    return mockDelay(state.circuitBreaker);
  },
  async setCircuitBreaker(enabled: boolean, reason: string): Promise<CircuitBreakerState> {
    state.circuitBreaker = {
      enabled,
      reason,
      updatedAt: new Date().toISOString(),
      updatedBy: "陈管理员",
    };
    writeAudit(state, enabled ? "开启熔断" : "关闭熔断", "全站播放", reason);
    return mockDelay(state.circuitBreaker);
  },
  async compensate(input: CompensationInput): Promise<void> {
    writeAudit(state, "补偿权益", `用户 ${input.userId}`, `剧目 ${input.dramaId}，${input.seconds} 秒；${input.reason}`);
    return mockDelay(undefined);
  },
  async adjustEntitlement(input: AdjustmentInput): Promise<void> {
    writeAudit(state, 
      "权益纠错",
      `grant ${input.grantId}`,
      `${input.type} ${input.seconds} 秒；${input.reason}`,
    );
    return mockDelay(undefined);
  },
  async replayCallback(input: CallbackReplayInput): Promise<void> {
    writeAudit(state, 
      "回调重放",
      `事件 ${input.eventId}`,
      `${input.reason}${input.approvalNote ? `；${input.approvalNote}` : ""}`,
    );
    return mockDelay(undefined);
  },
  async listCallbackEvents(status = "BACKLOG"): Promise<PageResult<AdminCallbackEvent>> {
    const items: AdminCallbackEvent[] = [
      {
        eventId: "vod-dead-letter-1",
        provider: "VOD",
        eventType: "MEDIA_UPDATED",
        status: "DEAD_LETTER",
        attempts: CALLBACK_MAX_ATTEMPTS,
        receivedAt: isoHoursAgo(6),
        processedAt: null,
        processingUntil: null,
        outcome: "RETRYABLE_FAILURE",
        payloadAvailable: true,
        replayable: true,
      },
      {
        eventId: "wechat-retry-1",
        provider: "WECHAT",
        eventType: "REWARD_COMPLETED",
        status: "RETRYABLE_FAILURE",
        attempts: 2,
        receivedAt: isoHoursAgo(1),
        processedAt: null,
        processingUntil: null,
        outcome: "RETRYABLE_FAILURE",
        payloadAvailable: false,
        replayable: true,
      },
    ];
    const filtered =
      !status || status === "BACKLOG"
        ? items
        : items.filter((item) => item.status === status);
    return mockDelay({ items: filtered, total: filtered.length });
  },
  async reissueDeletionQueryToken(
    input: DeletionQueryTokenReissueInput,
  ): Promise<ReissueDeletionQueryTokenResponse> {
    writeAudit(state, 
      "注销查询令牌补发",
      `申请 ${input.deletionRequestId}`,
      `核验用户 ${input.userId}；${input.reason}；${input.approvalNote}`,
    );
    return mockDelay({
      deletionRequestId: input.deletionRequestId,
      status: DeletionRequestStatus.PENDING,
      tokenExpiresAt: new Date(Date.now() + DELETION_QUERY_TOKEN_TTL_SECONDS * 1000).toISOString(),
      replayed: false,
    });
  },
};
