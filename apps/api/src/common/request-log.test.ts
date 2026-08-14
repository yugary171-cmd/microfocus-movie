import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";
import { describeHttpException } from "./http.js";
import { buildRequestLog, sanitizeRequestPath, shouldSkipRequestLog } from "./request-log.js";

describe("structured request logs", () => {
  it("drops query strings so deletion tokens and other secrets never enter the path field", () => {
    expect(
      sanitizeRequestPath("/v1/me/deletion-requests/req-1?token=super-secret-query")
    ).toBe("/v1/me/deletion-requests/req-1");
    expect(shouldSkipRequestLog("/health/ready")).toBe(true);
    expect(shouldSkipRequestLog("/v1/playback/leases")).toBe(false);
  });

  it("records requestId, module, stable code, duration and actor without a request body", () => {
    expect(
      buildRequestLog({
        requestId: "req-123",
        module: "Playback",
        method: "post",
        url: "/v1/playback/leases/lease-1/heartbeats?debug=1",
        status: 200,
        code: "OK",
        durationMs: 12.4,
        actorKind: "user",
        actorId: "user-1"
      })
    ).toEqual({
      requestId: "req-123",
      module: "Playback",
      method: "POST",
      path: "/v1/playback/leases/lease-1/heartbeats",
      status: 200,
      code: "OK",
      durationMs: 12,
      actorKind: "user",
      actorId: "user-1"
    });
  });

  it("maps AppError to the same stable code the HTTP envelope uses", () => {
    const error = new AppError("RATE_LIMITED", "Too many requests", 429);
    expect(describeHttpException(error)).toMatchObject({
      status: 429,
      code: "RATE_LIMITED"
    });
    expect(
      buildRequestLog({
        requestId: "req-429",
        module: "Auth",
        method: "POST",
        url: "/v1/auth/wechat",
        status: 429,
        code: "RATE_LIMITED",
        durationMs: 3,
        actorKind: "anonymous"
      })
    ).toMatchObject({
      code: "RATE_LIMITED",
      actorKind: "anonymous",
      actorId: ""
    });
  });
});
