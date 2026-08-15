import { describe, expect, it } from "vitest";
import {
  REQUEST_ID_MAX_LENGTH,
  REQUEST_LOG_ACTOR_KIND_MAX_LENGTH,
  REQUEST_LOG_LABEL_MAX_LENGTH,
  REQUEST_LOG_METHOD_MAX_LENGTH,
  REQUEST_LOG_PATH_MAX_LENGTH
} from "@microfocus/contracts";
import { AppError } from "./app-error.js";
import { currentRequestId, describeHttpException, requestContext } from "./http.js";
import { buildRequestLog, sanitizeRequestPath, shouldSkipRequestLog } from "./request-log.js";

describe("structured request logs", () => {
  it("drops query strings so deletion tokens and other secrets never enter the path field", () => {
    expect(
      sanitizeRequestPath("/v1/me/deletion-requests/req-1?token=super-secret-query")
    ).toBe("/v1/me/deletion-requests/req-1");
    expect(shouldSkipRequestLog("/health/ready")).toBe(true);
    expect(shouldSkipRequestLog("/docs")).toBe(true);
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

  it("keeps the HTTP requestId available to nested audit writes", () => {
    const request = {
      header(name: string) {
        return name === "x-request-id" ? "admin-req-42" : undefined;
      },
      requestId: ""
    };
    const headers: Record<string, string> = {};
    const response = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      }
    };
    let nested = "";
    requestContext(request, response, () => {
      nested = currentRequestId();
    });
    expect(nested).toBe("admin-req-42");
    expect(headers["x-request-id"]).toBe("admin-req-42");
    expect(currentRequestId()).toBe("");
  });

  it("caps logged requestIds and rejects oversized inbound x-request-id headers", () => {
    expect(
      buildRequestLog({
        requestId: "a".repeat(REQUEST_ID_MAX_LENGTH + 8),
        module: "Admin",
        method: "GET",
        url: "/v1/admin/audit-logs",
        status: 200,
        code: "OK",
        durationMs: 4,
        actorKind: "admin",
        actorId: "admin-1"
      })?.requestId
    ).toBe("a".repeat(REQUEST_ID_MAX_LENGTH));

    const request = {
      header(name: string) {
        return name === "x-request-id" ? "a".repeat(REQUEST_ID_MAX_LENGTH + 1) : undefined;
      },
      requestId: ""
    };
    const headers: Record<string, string> = {};
    const response = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      }
    };
    requestContext(request, response, () => undefined);
    expect(headers["x-request-id"]).not.toBe("a".repeat(REQUEST_ID_MAX_LENGTH + 1));
    expect(headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("caps path, method, module, code and actor fields to the shared log widths", () => {
    const line = buildRequestLog({
      requestId: "req-cap",
      module: "M".repeat(REQUEST_LOG_LABEL_MAX_LENGTH + 8),
      method: "m".repeat(REQUEST_LOG_METHOD_MAX_LENGTH + 8),
      url: `/${"p".repeat(REQUEST_LOG_PATH_MAX_LENGTH + 8)}?secret=1`,
      status: 200,
      code: "C".repeat(REQUEST_LOG_LABEL_MAX_LENGTH + 8),
      durationMs: 1,
      actorKind: "k".repeat(REQUEST_LOG_ACTOR_KIND_MAX_LENGTH + 8),
      actorId: "a".repeat(REQUEST_LOG_LABEL_MAX_LENGTH + 8)
    });
    expect(line).toMatchObject({
      path: `/${"p".repeat(REQUEST_LOG_PATH_MAX_LENGTH - 1)}`,
      method: "M".repeat(REQUEST_LOG_METHOD_MAX_LENGTH),
      module: "M".repeat(REQUEST_LOG_LABEL_MAX_LENGTH),
      code: "C".repeat(REQUEST_LOG_LABEL_MAX_LENGTH),
      actorKind: "k".repeat(REQUEST_LOG_ACTOR_KIND_MAX_LENGTH),
      actorId: "a".repeat(REQUEST_LOG_LABEL_MAX_LENGTH)
    });
    expect(line?.path).toHaveLength(REQUEST_LOG_PATH_MAX_LENGTH);
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
