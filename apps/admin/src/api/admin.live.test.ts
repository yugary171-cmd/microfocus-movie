import { AdminRole } from "@microfocus/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function success(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, requestId: "request-test" }),
  } as Response;
}

describe("live admin API adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends OTP and adapts the backend admin login shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      success({
        accessToken: "test-access-token",
        admin: { id: "admin-1", email: "admin@example.com", role: "ADMIN" },
      }),
    );
    const { adminApi } = await import("./admin");

    const session = await adminApi.login(
      "admin@example.com",
      "password-for-test",
      "123456",
      AdminRole.EDITOR,
    );

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      email: "admin@example.com",
      password: "password-for-test",
      otp: "123456",
    });
    expect(session.user).toMatchObject({
      id: "admin-1",
      name: "admin@example.com",
      role: AdminRole.ADMIN,
    });
  });

  it("normalizes array list responses and merges the dashboard release gate", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(success([{ id: "drama-1", title: "剧目", status: "DRAFT" }]))
      .mockResolvedValueOnce(success({ published: 3, pendingReviews: 2 }))
      .mockResolvedValueOnce(
        success({
          entityApproved: true,
          miniProgramFilingApproved: true,
          wechatCategoryApproved: false,
          adsApproved: true,
          readyForExternalTraffic: false,
          blockers: ["微信类目未通过"],
        }),
      );
    const { adminApi } = await import("./admin");

    const dramas = await adminApi.listDramas();
    const dashboard = await adminApi.dashboard();

    expect(dramas).toMatchObject({ total: 1, items: [{ id: "drama-1" }] });
    expect(dashboard.reviewBacklog).toBe(2);
    expect(dashboard.releaseGate.readyForExternalTraffic).toBe(false);
  });

  it("uses backend review and compensation request contracts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T00:00:00.000Z"));
    vi.mocked(fetch).mockResolvedValue(success(null));
    const { adminApi } = await import("./admin");

    await adminApi.review("drama-1", "unused-review-id", false, "需要补齐版权资料");
    await adminApi.compensate({
      userId: "user-1",
      dramaId: "drama-1",
      seconds: 600,
      reason: "事故补偿",
    });

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      status: "REJECTED",
      notes: "需要补齐版权资料",
    });
    const compensateInit = vi.mocked(fetch).mock.calls[1]?.[1];
    expect(JSON.parse(String(compensateInit?.body))).toEqual({
      userId: "user-1",
      dramaId: "drama-1",
      seconds: 600,
      reason: "事故补偿",
      expiresAt: "2026-08-13T00:00:00.000Z",
    });
    expect(new Headers(compensateInit?.headers).get("Idempotency-Key")).toMatch(/^c:[a-f0-9]{64}$/);

    await adminApi.adjustEntitlement({
      type: "FREEZE_REMAINDER",
      grantId: "grant-1",
      seconds: 120,
      reason: "错误发放冻结",
    });
    const adjustInit = vi.mocked(fetch).mock.calls[2]?.[1];
    expect(JSON.parse(String(adjustInit?.body))).toEqual({
      type: "FREEZE_REMAINDER",
      grantId: "grant-1",
      seconds: 120,
      reason: "错误发放冻结",
    });
    expect(new Headers(adjustInit?.headers).get("Idempotency-Key")).toMatch(/^a:[a-f0-9]{64}$/);

    await adminApi.replayCallback({
      eventId: "event-1",
      reason: "修复验签时钟后重放",
      approvalNote: "INC-9",
    });
    const replayInit = vi.mocked(fetch).mock.calls[3]?.[1];
    expect(String(vi.mocked(fetch).mock.calls[3]?.[0])).toBe(
      "http://api.test/v1/admin/callback-events/event-1/replay",
    );
    expect(JSON.parse(String(replayInit?.body))).toEqual({
      reason: "修复验签时钟后重放",
      approvalNote: "INC-9",
    });
    expect(new Headers(replayInit?.headers).get("Idempotency-Key")).toMatch(/^r:[a-f0-9]{64}$/);

    await adminApi.reissueDeletionQueryToken({
      deletionRequestId: "del-1",
      userId: "user-1",
      reason: "用户遗失查询令牌",
      approvalNote: "工单 CS-1 已核验",
    });
    const reissueInit = vi.mocked(fetch).mock.calls[4]?.[1];
    expect(String(vi.mocked(fetch).mock.calls[4]?.[0])).toBe(
      "http://api.test/v1/admin/deletion-requests/del-1/query-tokens",
    );
    expect(JSON.parse(String(reissueInit?.body))).toEqual({
      userId: "user-1",
      reason: "用户遗失查询令牌",
      approvalNote: "工单 CS-1 已核验",
    });
    expect(new Headers(reissueInit?.headers).get("Idempotency-Key")).toMatch(/^q:[a-f0-9]{64}$/);
  });

  it("sends the upload signing metadata contract", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(
      success({ uploadUrl: "http://api.test/mock-upload", headers: {}, mock: true }),
    );
    const { adminApi } = await import("./admin");
    const file = new File(["video"], "episode.mp4", { type: "video/mp4" });

    const upload = adminApi.uploadEpisode("drama-1", "episode-1", file, vi.fn());
    const rejection = expect(upload).rejects.toThrow("fileId 注册链路尚未配置");
    await vi.runAllTimersAsync();
    await rejection;

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toEqual({
      dramaId: "drama-1",
      episodeId: "episode-1",
      fileName: "episode.mp4",
      size: 5,
      contentType: "video/mp4",
    });
  });
});
