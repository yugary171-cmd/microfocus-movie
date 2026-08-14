import {
  API_ROUTES as CONTRACT_ROUTES,
  boundedIdempotencyKey,
  ENTITY_ID_MAX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH
} from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { API_ROUTES, encodedRoute } from "../src/constants/routes";

describe("viewer routes follow contracts", () => {
  it("re-exports the shared API_ROUTES object", () => {
    expect(API_ROUTES).toBe(CONTRACT_ROUTES);
    expect(API_ROUTES.auth.wechat).toBe("/v1/auth/wechat");
    expect(API_ROUTES.playbackLeases).toBe("/v1/playback/leases");
  });

  it("encodes path entity ids before interpolating contract routes", () => {
    const id = "a/b c";
    const encoded = encodeURIComponent(id);
    expect(encodedRoute(API_ROUTES.drama, id)).toBe(`/v1/dramas/${encoded}`);
    expect(encodedRoute(API_ROUTES.entitlement, id)).toBe(`/v1/entitlements/${encoded}`);
    expect(encodedRoute(API_ROUTES.rewardComplete, id)).toBe(
      `/v1/rewards/challenges/${encoded}/complete`
    );
    expect(encodedRoute(API_ROUTES.playbackHeartbeat, id)).toBe(
      `/v1/playback/leases/${encoded}/heartbeats`
    );
    expect(encodedRoute(API_ROUTES.deletionRequest, id)).toBe(
      `/v1/me/deletion-requests/${encoded}`
    );
  });

  it("keeps viewer Idempotency-Key headers within the shared max length", () => {
    expect(boundedIdempotencyKey("reward-", "challenge-1")).toBe("reward-challenge-1");
    expect(boundedIdempotencyKey("d:", "user-1")).toBe("d:user-1");
    const longId = "x".repeat(ENTITY_ID_MAX_LENGTH);
    const rewardKey = boundedIdempotencyKey("reward-", longId);
    const deletionKey = boundedIdempotencyKey("d:", longId);
    expect(rewardKey.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH);
    expect(deletionKey.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH);
    expect(rewardKey).toBe(boundedIdempotencyKey("reward-", `  ${longId}  `));
    expect(rewardKey).not.toBe(boundedIdempotencyKey("reward-", "y".repeat(ENTITY_ID_MAX_LENGTH)));
  });
});
