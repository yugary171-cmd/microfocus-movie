import { describe, expect, it, vi } from "vitest";
import type { PlaybackHeartbeatResponse, RewardChallengeView } from "@microfocus/contracts";
import { FREE_EPISODE_COUNT, OFFLINE_GRACE_SECONDS, PLAYBACK_RATE_MAX, PLAYBACK_RATE_MIN, REWARD_SECONDS } from "@microfocus/contracts";
import { PlaybackHeartbeatController } from "../src/services/playback-controller";
import { retryRewardConfirmation, runRewardFlow, describeRewardResult } from "../src/services/reward";
import type { RewardedAdCloseResult, RewardedAdHandle } from "../src/platform/ads";
import { ApiClientError, toFriendlyErrorMessage } from "../src/utils/errors";
import { canStartEpisode, isFreeEpisode } from "../src/utils/episode";
import { formatApproximateRemainingEpisodes, formatRemainingTime, formatRewardUnlockCopy } from "../src/utils/format";
import { playerUrlFromHistory, toHistoryCardViews } from "../src/utils/history-view";
import { buildDramaShareCard } from "../src/utils/drama-share";
import { buildSupportPacket } from "../src/utils/support-packet";
import { sanitizeFunnelProps, trackFunnelEvent, recentFunnelEvents } from "../src/services/telemetry";
import { resolveHistoryPlayerUrl } from "../src/utils/history-navigation";
import { paginateItems } from "../src/utils/pagination";
import { playerUrlFromEpisode } from "../src/utils/player-navigation";
import {
  applyProfilePatch,
  boundNickname,
  canSaveNickname,
  canSaveSignature,
  formatMicrofocusId
} from "../src/utils/profile";

function stubUni(overrides: Record<string, unknown> = {}) {
  const storage = (overrides.storage as Map<string, unknown>) ?? new Map<string, unknown>();
  const uniMock = {
    login: vi.fn((options: { success: (value: { code: string }) => void }) => {
      options.success({ code: "fresh-wechat-code" });
    }),
    getUserProfile: vi.fn(
      (options: {
        success: (value: { userInfo: { nickName: string; avatarUrl: string } }) => void;
      }) => {
        options.success({ userInfo: { nickName: "内部体验用户", avatarUrl: "" } });
      }
    ),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    getStorageSync: (key: string) => storage.get(key) ?? "",
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    request: vi.fn(),
    createRewardedVideoAd: vi.fn(),
    ...overrides
  };
  vi.stubGlobal("uni", uniMock);
  return { storage, uniMock };
}

describe("explicit WeChat login", () => {
  it("obtains a fresh WeChat code and persists the resulting Mock session", async () => {
    vi.resetModules();
    stubUni();
    const { ensureSession, getStoredSession, clearStoredSession } = await import("../src/services/api");
    const session = await ensureSession();
    expect(session).toMatchObject({
      accessToken: "internal-mock-session-fresh-wechat",
      user: { id: "internal-user-fresh-wechat", displayName: "内部体验用户" }
    });
    expect(getStoredSession()).toMatchObject({ accessToken: "internal-mock-session-fresh-wechat" });
    clearStoredSession();
    expect(getStoredSession()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("treats WeChat nickname authorization cancel as a denied profile", async () => {
    vi.resetModules();
    stubUni({
      getUserProfile: (options: { fail: (error: { errMsg: string }) => void }) => {
        options.fail({ errMsg: "getUserProfile:fail auth deny" });
      }
    });
    const { isWechatProfileAuthorizationDenied, obtainWechatUserProfile } = await import("../src/platform/auth");
    await expect(obtainWechatUserProfile()).rejects.toSatisfy((error: unknown) =>
      isWechatProfileAuthorizationDenied(error)
    );
    vi.unstubAllGlobals();
  });

  it("applies the WeChat nickname locally after a Mock session is stored", async () => {
    vi.resetModules();
    stubUni();
    const { ensureSession, applyLocalWechatProfile, getStoredSession } = await import("../src/services/api");
    await ensureSession();
    applyLocalWechatProfile({ displayName: "Stellan", avatarUrl: "https://example.com/a.png" });
    expect(getStoredSession()?.user).toMatchObject({
      displayName: "Stellan",
      avatarUrl: "https://example.com/a.png"
    });
    vi.unstubAllGlobals();
  });
});

describe("H5 and App auth/ads boundaries", () => {
  it("does not call /v1/auth/wechat on H5 live mode", async () => {
    vi.resetModules();
    vi.stubEnv("MICROFOCUS_CLIENT_PLATFORM", "h5");
    const request = vi.fn();
    stubUni({ request });
    vi.doMock("../src/config/runtime", () => ({
      RUNTIME_CONFIG: {
        apiBaseUrl: "https://api.test",
        requestTimeoutMs: 10_000,
        productName: "微焦短剧",
        demoVideoUrl: "",
        demoVideoTwoUrl: "",
        demoVideoUrls: []
      }
    }));
    const { ensureSession } = await import("../src/services/api");
    await expect(ensureSession()).rejects.toThrow("/v1/auth/wechat");
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("../src/config/runtime");
  });

  it("uses a guest mock session on H5 develop without hitting WeChat login", async () => {
    vi.resetModules();
    vi.stubEnv("MICROFOCUS_CLIENT_PLATFORM", "h5");
    const { uniMock } = stubUni();
    const { ensureSession } = await import("../src/services/api");
    const session = await ensureSession();
    expect(uniMock.login).not.toHaveBeenCalled();
    expect(session.accessToken).toContain("guest-mock");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects rewarded ads on H5 without inventing WeChat isEnded", async () => {
    vi.resetModules();
    vi.stubEnv("MICROFOCUS_CLIENT_PLATFORM", "h5");
    stubUni();
    const { createRewardedVideoAd, unsupportedRewardedAdMessage } = await import("../src/platform/ads");
    const ad = createRewardedVideoAd("ad-unit");
    await expect(ad.show()).rejects.toThrow("请在微信小程序观看广告解锁");
    expect(unsupportedRewardedAdMessage()).toContain("微信小程序");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects App ads with a platform-specific message instead of WeChat isEnded", async () => {
    vi.resetModules();
    vi.stubEnv("MICROFOCUS_CLIENT_PLATFORM", "app");
    stubUni();
    const { createRewardedVideoAd } = await import("../src/platform/ads");
    await expect(createRewardedVideoAd("ad-unit").show()).rejects.toThrow("不能沿用微信 isEnded");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("live watch-history navigation", () => {
  it("maps real API history and preserves the resume position in the player route", () => {
    const cards = toHistoryCardViews([
      {
        drama: {
          id: "live-drama",
          title: "真实播放记录",
          summary: "",
          coverUrl: "",
          category: "都市",
          tags: [],
          episodeCount: 12,
          recommendationRank: 1,
          licenseNumber: ""
        },
        episodeNumber: 3,
        mediaPositionSeconds: 86,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ dramaId: "live-drama", episodeNumber: 3, position: 86 });
    expect(playerUrlFromHistory(cards[0]!, "episode-3")).toContain(
      "dramaId=live-drama&episodeId=episode-3&title=%E7%9C%9F%E5%AE%9E%E6%92%AD%E6%94%BE%E8%AE%B0%E5%BD%95&episodeNumber=3&position=86"
    );
  });

  it("resolves live history to the selected episode player route", async () => {
    const cards = toHistoryCardViews([
      {
        drama: {
          id: "live-drama",
          title: "真实播放记录",
          summary: "",
          coverUrl: "",
          category: "都市",
          tags: [],
          episodeCount: 12,
          recommendationRank: 1,
          licenseNumber: ""
        },
        episodeNumber: 3,
        mediaPositionSeconds: 86,
        updatedAt: "2026-08-13T00:00:00.000Z"
      }
    ]);
    const url = await resolveHistoryPlayerUrl(cards[0]!, async () => ({
      id: "live-drama",
      title: "真实播放记录",
      summary: "",
      coverUrl: "",
      category: "都市",
      tags: [],
      episodeCount: 12,
      recommendationRank: 1,
      licenseNumber: "",
      rightsHolder: "",
      episodes: [{ id: "episode-3", episodeNumber: 3, title: "第 3 集", durationSeconds: 120, isFree: false }]
    }));
    expect(url).toContain("episodeId=episode-3");
    expect(url).toContain("position=86");
  });
});

function createFakeAd() {
  let closeListener: ((result: RewardedAdCloseResult) => void) | undefined;
  let errorListener: ((error: unknown) => void) | undefined;
  const ad: RewardedAdHandle = {
    load: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn((listener) => {
      closeListener = listener;
    }),
    offClose: vi.fn((listener) => {
      if (closeListener === listener) closeListener = undefined;
    }),
    onError: vi.fn((listener) => {
      errorListener = listener;
    }),
    offError: vi.fn((listener) => {
      if (errorListener === listener) errorListener = undefined;
    })
  };
  return {
    ad,
    close: (result: RewardedAdCloseResult) => closeListener?.(result),
    fail: (error: unknown) => errorListener?.(error)
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function heartbeatResponse(acknowledgedSeq: number): PlaybackHeartbeatResponse {
  return {
    acknowledgedSeq,
    debitedSeconds: 5,
    remainingSeconds: 55,
    mayContinue: true
  };
}

const serverVerifiedChallenge: RewardChallengeView = {
  id: "challenge-server-1",
  nonce: "server-nonce",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  adUnitId: "test-ad-unit",
  verificationMode: "server_verified"
};

describe("formatRemainingTime", () => {
  it("normalizes malformed and negative values", () => {
    expect(formatRemainingTime(undefined)).toBe("0秒");
    expect(formatRemainingTime(-10)).toBe("0秒");
  });

  it("formats seconds, minutes and hours", () => {
    expect(formatRemainingTime(59)).toBe("59秒");
    expect(formatRemainingTime(125)).toBe("2分钟");
    expect(formatRemainingTime(3_900)).toBe("1小时5分钟");
  });
});

describe("entitlement episode copy", () => {
  it("converts remaining seconds with published median duration", () => {
    expect(formatApproximateRemainingEpisodes(600, [120, 120, 150])).toBe("约 5 集");
    expect(formatApproximateRemainingEpisodes(30, [120])).toBe("不足1集");
    expect(formatApproximateRemainingEpisodes(0, [120])).toBe("约 0 集");
  });

  it("falls back to clock time when durations are missing", () => {
    expect(formatApproximateRemainingEpisodes(125, [])).toBe("2分钟");
  });

  it("describes a full reward with TTL, scope and incomplete-ad rules", () => {
    const copy = formatRewardUnlockCopy("样片", [120]);
    expect(copy).toContain("约 5 集");
    expect(copy).toContain("24 小时内有效");
    expect(copy).toContain("仅本剧有效");
    expect(copy).toContain("广告未看完不发奖");
  });
});

describe("episode access", () => {
  it("keeps exactly the first contract-free episodes unlocked", () => {
    expect(isFreeEpisode(FREE_EPISODE_COUNT)).toBe(true);
    expect(isFreeEpisode(FREE_EPISODE_COUNT + 1)).toBe(false);
  });

  it("requires current-drama balance for locked episodes", () => {
    expect(canStartEpisode(FREE_EPISODE_COUNT + 1, 0)).toBe(false);
    expect(canStartEpisode(FREE_EPISODE_COUNT + 1, 1)).toBe(true);
  });
});

describe("reward flow", () => {
  it("does not complete a challenge when the ad is incomplete", async () => {
    const fake = createFakeAd();
    const completeChallenge = vi.fn();
    const pending = runRewardFlow({
      createChallenge: vi.fn().mockResolvedValue({
        id: "challenge-1",
        nonce: "nonce",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        adUnitId: "test-ad-unit",
        verificationMode: "client_attestation"
      }),
      completeChallenge,
      createAd: () => fake.ad
    });
    await vi.waitFor(() => expect(fake.ad.show).toHaveBeenCalled());
    fake.close({ isEnded: false });
    await expect(pending).resolves.toEqual({ status: "incomplete" });
    expect(completeChallenge).not.toHaveBeenCalled();
  });

  it("treats WeChat 1004 as no-fill without completing", async () => {
    const fake = createFakeAd();
    const completeChallenge = vi.fn();
    const pending = runRewardFlow({
      createChallenge: vi.fn().mockResolvedValue({
        id: "challenge-1",
        nonce: "nonce",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        adUnitId: "test-ad-unit",
        verificationMode: "client_attestation"
      }),
      completeChallenge,
      createAd: () => fake.ad
    });
    await vi.waitFor(() => expect(fake.ad.show).toHaveBeenCalled());
    fake.fail({ errCode: 1004, errMsg: "no advertisement" });
    await expect(pending).resolves.toMatchObject({ status: "unavailable", reason: "no_fill" });
    expect(completeChallenge).not.toHaveBeenCalled();
  });

  it("keeps load failures distinguishable from verification failure", async () => {
    const fake = createFakeAd();
    const pending = runRewardFlow({
      createChallenge: vi.fn().mockResolvedValue({
        id: "challenge-1",
        nonce: "nonce",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        adUnitId: "test-ad-unit",
        verificationMode: "client_attestation"
      }),
      completeChallenge: vi.fn(),
      createAd: () => fake.ad
    });
    await vi.waitFor(() => expect(fake.ad.show).toHaveBeenCalled());
    fake.fail({ errCode: 1000, errMsg: "backend error" });
    const result = await pending;
    expect(result).toMatchObject({ status: "unavailable", reason: "load_failed" });
    if (result.status === "completed") return;
    expect(describeRewardResult(result)).toContain("广告加载失败");
    expect(describeRewardResult({ status: "incomplete" })).toContain("未完整播放");
    expect(
      describeRewardResult({
        status: "unavailable",
        reason: "no_fill",
        error: { errCode: 1004 }
      })
    ).toContain("没有可播放的广告");
    expect(
      describeRewardResult({
        status: "failed",
        error: new Error("boom")
      })
    ).toContain("奖励确认失败");
  });

  it("polls server verification with the same challenge and bounded delays", async () => {
    const pending = {
      challenge: serverVerifiedChallenge,
      clientCompletedAt: "2026-08-12T12:00:00.000Z"
    };
    const entitlement = {
      dramaId: "drama-1",
      remainingSeconds: REWARD_SECONDS,
      nearestExpiresAt: "2026-08-13T12:00:00.000Z",
      grants: []
    };
    const notVerified = new ApiClientError("奖励尚未由服务端确认", "REWARD_NOT_VERIFIED", 409);
    const completeChallenge = vi
      .fn()
      .mockRejectedValueOnce(notVerified)
      .mockRejectedValueOnce(notVerified)
      .mockResolvedValueOnce(entitlement);
    const wait = vi.fn().mockResolvedValue(undefined);
    const result = await retryRewardConfirmation(
      {
        createChallenge: vi.fn(),
        completeChallenge,
        createAd: vi.fn(),
        wait,
        verificationRetryDelaysMs: [1_000, 2_000, 3_000]
      },
      pending
    );
    expect(result).toEqual({ status: "completed", entitlement });
    expect(completeChallenge).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("keeps the same pending challenge after bounded verification retries", async () => {
    const pending = {
      challenge: serverVerifiedChallenge,
      clientCompletedAt: "2026-08-12T12:00:00.000Z"
    };
    const error = new ApiClientError("奖励尚未由服务端确认", "REWARD_NOT_VERIFIED", 409);
    const completeChallenge = vi.fn().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);
    const result = await retryRewardConfirmation(
      {
        createChallenge: vi.fn(),
        completeChallenge,
        createAd: vi.fn(),
        wait,
        verificationRetryDelaysMs: [1_000, 2_000, 3_000]
      },
      pending
    );
    expect(result).toEqual({ status: "confirmation_pending", pending, error });
    expect(completeChallenge).toHaveBeenCalledTimes(4);
  });

  it("preserves a completed challenge for manual retry after a network error", async () => {
    const pending = {
      challenge: serverVerifiedChallenge,
      clientCompletedAt: "2026-08-12T12:00:00.000Z"
    };
    const error = new ApiClientError("网络超时", "NETWORK_ERROR", 0);
    await expect(
      retryRewardConfirmation(
        {
          createChallenge: vi.fn(),
          completeChallenge: vi.fn().mockRejectedValue(error),
          createAd: vi.fn(),
          wait: vi.fn()
        },
        pending
      )
    ).resolves.toEqual({ status: "confirmation_pending", pending, error });
  });

  it("never creates a second challenge when retrying pending confirmation", async () => {
    const fake = createFakeAd();
    const error = new ApiClientError("奖励尚未由服务端确认", "REWARD_NOT_VERIFIED", 409);
    const createChallenge = vi.fn().mockResolvedValue(serverVerifiedChallenge);
    const completeChallenge = vi.fn().mockRejectedValue(error);
    const dependencies = {
      createChallenge,
      completeChallenge,
      createAd: () => fake.ad,
      wait: vi.fn().mockResolvedValue(undefined),
      verificationRetryDelaysMs: [] as number[]
    };
    const initialFlow = runRewardFlow(dependencies);
    await vi.waitFor(() => expect(fake.ad.show).toHaveBeenCalled());
    fake.close({ isEnded: true });
    const initialResult = await initialFlow;
    expect(initialResult.status).toBe("confirmation_pending");
    if (initialResult.status !== "confirmation_pending") return;
    await retryRewardConfirmation(dependencies, initialResult.pending);
    expect(createChallenge).toHaveBeenCalledOnce();
    expect(completeChallenge).toHaveBeenCalledTimes(2);
  });
});

describe("playback heartbeat controller", () => {
  it("only sends while playing and advances after server acknowledgement", async () => {
    const controller = new PlaybackHeartbeatController();
    controller.setPosition(5);
    const send = vi.fn(async (request) => ({
      acknowledgedSeq: request.seq,
      debitedSeconds: 5,
      remainingSeconds: 595,
      mayContinue: true
    }));
    await expect(controller.tick(send)).resolves.toEqual({ status: "idle" });
    controller.setState("playing");
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    controller.setPosition(10);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ seq: 2, mediaPositionSeconds: 10, previousMediaPositionSeconds: 5 })
    );
    controller.setState("buffering");
    await expect(controller.tick(send)).resolves.toEqual({ status: "idle" });
  });

  it("clamps heartbeat playback rate to the contract range", async () => {
    const controller = new PlaybackHeartbeatController();
    const send = vi.fn(async (request) => heartbeatResponse(request.seq));
    controller.setState("playing");
    controller.setPosition(5);
    controller.setPlaybackRate(PLAYBACK_RATE_MAX + 1);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ playbackRate: PLAYBACK_RATE_MAX })
    );
    controller.setPlaybackRate(PLAYBACK_RATE_MIN - 0.5);
    controller.setPosition(10);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ playbackRate: PLAYBACK_RATE_MIN })
    );
  });

  it("does not start a second heartbeat while a slow request is in flight", async () => {
    const controller = new PlaybackHeartbeatController();
    const slow = deferred<PlaybackHeartbeatResponse>();
    const send = vi.fn(() => slow.promise);
    controller.setState("playing");
    controller.setPosition(5);
    const firstTick = controller.tick(send);
    controller.setPosition(10);
    await expect(controller.tick(send)).resolves.toEqual({ status: "idle" });
    slow.resolve(heartbeatResponse(1));
    await expect(firstTick).resolves.toMatchObject({ status: "confirmed" });
  });

  it("retries the identical sequence and anchor after a failed request", async () => {
    const controller = new PlaybackHeartbeatController();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockImplementationOnce(async (request) => heartbeatResponse(request.seq));
    controller.setInitialPosition(2);
    controller.setState("playing");
    controller.setPosition(7);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "failed" });
    controller.setPosition(12);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    expect(send.mock.calls[0]?.[0]).toEqual(send.mock.calls[1]?.[0]);
  });

  it("ignores a late callback after stop and never resumes heartbeats", async () => {
    const controller = new PlaybackHeartbeatController();
    const slow = deferred<PlaybackHeartbeatResponse>();
    const send = vi.fn(() => slow.promise);
    controller.setState("playing");
    controller.setPosition(5);
    const tick = controller.tick(send);
    controller.stop();
    slow.resolve(heartbeatResponse(1));
    await expect(tick).resolves.toEqual({ status: "stale" });
    await expect(controller.tick(send)).resolves.toEqual({ status: "idle" });
  });

  it("pauses after the offline grace only when playing", () => {
    const controller = new PlaybackHeartbeatController();
    const offlineSince = 1_000;
    const pauseAt = offlineSince + OFFLINE_GRACE_SECONDS * 1000;
    controller.setState("playing");
    controller.setNetworkAvailable(false, offlineSince);
    expect(controller.shouldPauseForOffline(pauseAt - 1)).toBe(false);
    expect(controller.shouldPauseForOffline(pauseAt)).toBe(true);
    controller.setState("paused");
    expect(controller.shouldPauseForOffline(pauseAt + OFFLINE_GRACE_SECONDS * 1000)).toBe(false);
  });
});

describe("API error fallback", () => {
  it("returns a safe message for missing or malformed errors", () => {
    expect(toFriendlyErrorMessage(null)).toBe("服务暂时不可用，请稍后重试");
    expect(toFriendlyErrorMessage({ code: "BAD" })).toBe("服务暂时不可用，请稍后重试");
    expect(toFriendlyErrorMessage(new Error("网络超时"))).toBe("网络超时");
  });
});

describe("home feed pagination", () => {
  it("slices a full list into pages and reports remaining items", () => {
    expect(paginateItems(["a", "b", "c", "d", "e"], 1, 2)).toEqual({
      items: ["a", "b"],
      page: 1,
      hasMore: true
    });
    expect(paginateItems(["a", "b", "c", "d", "e"], 3, 2)).toEqual({
      items: ["e"],
      page: 3,
      hasMore: false
    });
  });

  it("does not return the full mock catalog on the first search page", async () => {
    const { mockApi } = await import("../src/mocks/data");
    const { SEARCH_PAGE_SIZE } = await import("@microfocus/contracts");
    const first = await mockApi.search("", "", 1);
    expect(first.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = await mockApi.search("", "", 2);
    expect(second.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it("treats search pages beyond 100 as empty results", async () => {
    const { mockApi } = await import("../src/mocks/data");
    const { SEARCH_MAX_PAGE } = await import("@microfocus/contracts");
    const result = await mockApi.search("", "", SEARCH_MAX_PAGE + 1);
    expect(result.items).toEqual([]);
    expect(result.page).toBe(SEARCH_MAX_PAGE + 1);
    expect(result.hasMore).toBe(false);
  });

  it("exposes the published seed sample in search and detail with four priced episodes", async () => {
    const { mockApi } = await import("../src/mocks/data");
    const result = await mockApi.search("微焦之城", "", 1);
    expect(result.items[0]).toMatchObject({ id: "seed-drama-1", title: "微焦之城" });

    const detail = await mockApi.getDrama("seed-drama-1");
    expect(detail.episodes).toHaveLength(4);
    expect(detail.episodes.map((episode) => episode.isFree)).toEqual(
      detail.episodes.map((_, index) => index < FREE_EPISODE_COUNT)
    );
    expect((await mockApi.search("成长", "", 1)).items).toHaveLength(0);
    expect((await mockApi.search("本地开发", "", 1)).items[0]?.id).toBe("seed-drama-1");
  });

  it("maps player IDs, provides demo fallback for all episodes, and locks paid episodes", async () => {
    const { mockApi } = await import("../src/mocks/data");
    const { pickDemoVideoUrl } = await import("../src/config/demo-media");
    const { RUNTIME_CONFIG } = await import("../src/config/runtime");
    const detail = await mockApi.getDrama("seed-drama-1");
    const episodeIds = detail.episodes.map((episode) => episode.id);
    const fallbackUrls = episodeIds.map((id) =>
      pickDemoVideoUrl(RUNTIME_CONFIG.demoVideoUrls, id, RUNTIME_CONFIG.demoVideoUrl)
    );
    expect(fallbackUrls).toHaveLength(4);
    expect(fallbackUrls.every((url) => /\/demo\/.+\.mp4$/.test(url))).toBe(true);

    const freeLeases = await Promise.all(
      detail.episodes.slice(0, FREE_EPISODE_COUNT).map((episode) =>
        mockApi.createPlaybackLease({ episodeId: episode.id, deviceId: "test-device" })
      )
    );
    expect(freeLeases.map((lease) => lease.episodeId)).toEqual(episodeIds.slice(0, FREE_EPISODE_COUNT));
    expect(freeLeases.every((lease) => lease.isFree && /\/demo\/.+\.mp4$/.test(lease.playbackUrl))).toBe(true);

    await expect(
      mockApi.createPlaybackLease({ episodeId: episodeIds[FREE_EPISODE_COUNT]!, deviceId: "test-device" })
    ).rejects.toThrow("需要本剧观看时长");
    await expect(
      mockApi.createPlaybackLease({ episodeId: episodeIds[FREE_EPISODE_COUNT + 1]!, deviceId: "test-device" })
    ).rejects.toThrow("需要本剧观看时长");
    await expect(
      mockApi.createPlaybackLease({ episodeId: "unknown-episode", deviceId: "test-device" })
    ).rejects.toThrow("未找到可播放的剧集");

    expect(playerUrlFromEpisode(detail, detail.episodes[2]!)).toContain(
      "dramaId=seed-drama-1&episodeId=seed-drama-1-episode-3"
    );
  });
});

describe("home channels", () => {
  it("starts with 推荐 and popular short-drama categories, excluding unrelated media", async () => {
    const { buildHomeChannels, searchCategoryParam } = await import("../src/utils/home-channels");
    const channels = buildHomeChannels(["社区", "电影", "听书", "小说", "漫画", "漫剧", "真人剧", "都市"]);
    expect(channels[0]).toBe("推荐");
    expect(channels).toContain("战神");
    expect(channels).toContain("甜宠");
    expect(channels).toContain("都市");
    expect(channels).not.toContain("找剧");
    expect(channels).not.toContain("社区");
    expect(channels).not.toContain("电影");
    expect(channels).not.toContain("听书");
    expect(channels).not.toContain("小说");
    expect(channels).not.toContain("漫画");
    expect(searchCategoryParam("推荐")).toBe("");
    expect(searchCategoryParam("战神")).toBe("战神");
  });
});

describe("discover filters and ranking", () => {
  it("collapses recommendation audience and time rows and keeps four ranking types", async () => {
    const { RANKING_TABS, RANKING_TYPES, visibleDiscoverSections } = await import("../src/utils/discover");
    expect(visibleDiscoverSections(true).map((item) => item.all)).toEqual([
      "全部体裁",
      "全部主题",
      "全部设定",
      "全部背景",
      "全部推荐",
      "全部受众",
      "全部时间"
    ]);
    expect(visibleDiscoverSections(false).map((item) => item.all)).toEqual([
      "全部体裁",
      "全部主题",
      "全部设定",
      "全部背景"
    ]);
    expect([...RANKING_TABS]).toEqual(["全部", "真人剧", "漫剧", "AI 剧"]);
    expect([...RANKING_TYPES]).toEqual(["推荐榜", "热播榜", "热搜榜", "收藏榜"]);
  });
});

describe("home catalog fixture", () => {
  it("loads mock catalog without throwing on channel lists", async () => {
    const { mockApi } = await import("../src/mocks/data");
    await expect(mockApi.getCatalog()).resolves.toMatchObject({
      categories: expect.arrayContaining(["推荐", "战神", "兵王"])
    });
  });
});

describe("search discovery", () => {
  it("keeps ranking/new/actor/filter shortcuts and never includes identify or topic boards", async () => {
    const { SEARCH_SHORTCUTS } = await import("../src/constants/search");
    const { isForbiddenSearchSection, pickGuessQueries } = await import(
      "../src/utils/search-discovery"
    );
    expect(SEARCH_SHORTCUTS.map((item) => item.label)).toEqual(["排行", "上新", "演员", "筛选"]);
    expect(isForbiddenSearchSection("话题榜")).toBe(true);
    expect(isForbiddenSearchSection("识剧")).toBe(true);
    const guesses = pickGuessQueries(["战神归来", "识剧入口", "话题榜热搜", "甜宠日常"], 42, 8);
    expect(guesses.sort()).toEqual(["战神归来", "甜宠日常"]);
  });
});

describe("playback tap gesture", () => {
  it("treats a short still touch as tap and ignores swipe or long press", async () => {
    const {
      holdBoostRate,
      isPlaybackTap,
      PLAYBACK_HOLD_MS,
      PLAYBACK_TAP_MAX_MS,
      PLAYBACK_TAP_MOVE_MAX_PX,
      restoreHoldRate,
      shouldStartHoldBoost
    } = await import("../src/utils/playback-gesture");
    const { PLAYBACK_RATE_MAX } = await import("@microfocus/contracts");
    expect(isPlaybackTap(0, 120)).toBe(true);
    expect(isPlaybackTap(PLAYBACK_TAP_MOVE_MAX_PX, PLAYBACK_TAP_MAX_MS)).toBe(true);
    expect(isPlaybackTap(PLAYBACK_TAP_MOVE_MAX_PX + 1, 120)).toBe(false);
    expect(isPlaybackTap(0, PLAYBACK_TAP_MAX_MS + 1)).toBe(false);
    expect(isPlaybackTap(Number.NaN, 120)).toBe(false);
    expect(shouldStartHoldBoost(true, 0, PLAYBACK_HOLD_MS)).toBe(true);
    expect(shouldStartHoldBoost(false, 0, PLAYBACK_HOLD_MS)).toBe(false);
    expect(shouldStartHoldBoost(true, PLAYBACK_TAP_MOVE_MAX_PX + 1, PLAYBACK_HOLD_MS)).toBe(false);
    expect(holdBoostRate()).toBe(PLAYBACK_RATE_MAX);
    expect(restoreHoldRate(1.5)).toBe(1.5);
  });
});

describe("local engagement helpers", () => {
  it("formats counts and clones comment threads without a backend", async () => {
    const { formatEngagementCount, shareDramaText } = await import("../src/utils/engagement");
    const { cloneLocalComments, countLocalComments } = await import("../src/mocks/comments");
    expect(formatEngagementCount(9712)).toBe("9712");
    expect(formatEngagementCount(1194000)).toBe("119.4万");
    expect(shareDramaText("皇后娘娘来打工", "第65集")).toBe("皇后娘娘来打工 · 第65集");
    const { shareIfExternallyAllowed } = await import("../src/utils/engagement");
    stubUni({
      showToast: vi.fn(),
      setClipboardData: vi.fn()
    });
    expect(shareIfExternallyAllowed("样片 · 第1集", false)).toBe(false);
    expect(uni.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "内部体验不可外部分享" })
    );
    expect(uni.setClipboardData).not.toHaveBeenCalled();
    expect(shareIfExternallyAllowed("样片 · 第1集", true)).toBe(true);
    expect(uni.setClipboardData).toHaveBeenCalled();
    vi.unstubAllGlobals();
    const comments = cloneLocalComments();
    expect(countLocalComments(comments)).toBeGreaterThan(comments.length);
    expect(comments[0]?.replies.length).toBeGreaterThan(0);
  });
});

describe("watch client icons", () => {
  it("points action icons at local files and iconfont search queries", async () => {
    const { ACTION_ICONS, ICONFONT_QUERIES, ICONFONT_SEARCH_URL } = await import(
      "../src/constants/icons"
    );
    expect(ICONFONT_SEARCH_URL).toContain("iconfont.cn/search");
    expect(Object.keys(ICONFONT_QUERIES)).toEqual(["star", "comment", "heart", "share"]);
    expect(ACTION_ICONS.starGold).toBe("/static/icons/star-gold.png");
    expect(ACTION_ICONS.comment).toBe("/static/icons/comment.png");
  });
});

describe("demo media origin", () => {
  it("falls back to loopback and rejects non-http values", async () => {
    const { demoVideoUrls, pickDemoVideoUrl, FALLBACK_DEMO_MEDIA_ORIGIN, normalizeDemoMediaOrigin } =
      await import("../src/config/demo-media");
    expect(normalizeDemoMediaOrigin(undefined)).toBe(FALLBACK_DEMO_MEDIA_ORIGIN);
    expect(normalizeDemoMediaOrigin("javascript:alert(1)")).toBe(FALLBACK_DEMO_MEDIA_ORIGIN);
    const urls = demoVideoUrls("http://192.168.1.23:5174/");
    expect(urls.demoVideoUrl).toBe("http://192.168.1.23:5174/demo/short-drama.mp4");
    expect(urls.demoVideoTwoUrl).toBe("http://192.168.1.23:5174/demo/second-short-drama.mp4");
    expect(urls.urls).toHaveLength(10);
    expect(urls.urls[9]).toBe("http://192.168.1.23:5174/demo/mock-10-healer.mp4");
    expect(pickDemoVideoUrl(urls.urls, "demo-d2-e3", urls.demoVideoUrl)).toMatch(/\/demo\/.+\.mp4$/);
  });
});

describe("share, support packet and funnel privacy", () => {
  it("does not build an exportable share card in Mock", () => {
    expect(
      buildDramaShareCard({
        isMock: true,
        drama: { id: "d1", title: "内部剧", summary: "s", coverUrl: "https://example.com/c.png" }
      })
    ).toBeNull();
  });

  it("builds a detail-page share card for live published dramas", () => {
    expect(
      buildDramaShareCard({
        isMock: false,
        drama: { id: "d1", title: "已发布剧", summary: "简介", coverUrl: "https://example.com/c.png" }
      })
    ).toEqual({
      title: "已发布剧",
      path: "/pages/drama/index?id=d1",
      imageUrl: "https://example.com/c.png"
    });
  });

  it("builds a support packet without secrets", () => {
    const packet = buildSupportPacket({
      challengeId: "challenge-1",
      dramaId: "drama-1",
      requestId: "req-1"
    });
    expect(packet).toContain("challengeId: challenge-1");
    expect(packet).not.toMatch(/token|password|session_key/i);
  });

  it("drops sensitive funnel properties", () => {
    trackFunnelEvent("ad_fail", { dramaId: "drama-1", accessToken: "secret", session_key: "k" });
    const last = recentFunnelEvents().at(-1);
    expect(last).toMatchObject({ event: "ad_fail", props: { dramaId: "drama-1" } });
    expect(last?.props).not.toHaveProperty("accessToken");
    expect(sanitizeFunnelProps({ Authorization: "Bearer x", ok: true })).toEqual({ ok: true });
  });
});

describe("user profile", () => {
  it("keeps nicknames within 1-10 characters and rejects no-op saves", () => {
    expect(formatMicrofocusId("user-abcdef123456")).toBe("USER-ABCDEF1");
    expect(boundNickname("一二三四五六七八九十超了")).toBe("一二三四五六七八九十");
    expect(canSaveNickname("旧名", "")).toBe(false);
    expect(canSaveNickname("旧名", "旧名")).toBe(false);
    expect(canSaveNickname("旧名", "新昵称")).toBe(true);
  });

  it("applies signature and gender patches", () => {
    const current = {
      id: "user-1",
      displayName: "旧名",
      avatarUrl: null,
      signature: "",
      gender: "unset" as const
    };
    expect(applyProfilePatch(current, { signature: "hi", gender: "male" })).toEqual({
      ...current,
      signature: "hi",
      gender: "male"
    });
    expect(canSaveSignature("", "介绍一下自己")).toBe(true);
    expect(canSaveSignature("介绍一下自己", "介绍一下自己")).toBe(false);
  });

  it("persists mock profile updates through get/patch", async () => {
    const { mockApi } = await import("../src/mocks/data");
    await mockApi.authWechat("fresh-wechat-code");
    await mockApi.updateProfile({ displayName: "新昵称", signature: "介绍一下自己", gender: "female" });
    await expect(mockApi.getProfile()).resolves.toMatchObject({
      displayName: "新昵称",
      signature: "介绍一下自己",
      gender: "female"
    });
  });

  it("hydrates mock profile from a restored session without a new login", async () => {
    const { resetMockProfile, syncMockProfile } = await import("../src/mocks/profile-state");
    const { mockApi } = await import("../src/mocks/data");
    resetMockProfile();
    syncMockProfile({
      id: "internal-user-restored",
      displayName: "已登录用户",
      avatarUrl: null,
      signature: "",
      gender: "unset"
    });
    await expect(mockApi.getProfile()).resolves.toMatchObject({
      id: "internal-user-restored",
      displayName: "已登录用户"
    });
  });
});

describe("platform env", () => {
  it("exposes getEnvVersion without using import.meta", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/platform/env.ts", import.meta.url), "utf8")
    );
    expect(source.includes("import.meta")).toBe(false);
    const { getEnvVersion } = await import("../src/platform/env");
    expect(typeof getEnvVersion).toBe("function");
    expect(["develop", "trial", "release"]).toContain(getEnvVersion());
  });
});

describe("my page inbox", () => {
  it("places messages after likes and keeps five local categories", async () => {
    const { INBOX_ITEMS, INBOX_TAB, LIBRARY_TABS } = await import("../src/utils/inbox-view");
    expect([...LIBRARY_TABS]).toEqual(["历史", "收藏", "点赞", INBOX_TAB]);
    expect(INBOX_ITEMS.map((item) => item.title)).toEqual([
      "系统通知",
      "粉丝消息",
      "评论消息",
      "我的评论",
      "赞"
    ]);
  });
});

describe("watch history filters", () => {
  it("keeps only live-action, comic, and AI format chips", async () => {
    const { HISTORY_FORMAT_OPTIONS } = await import("../src/utils/history-filter");
    expect(HISTORY_FORMAT_OPTIONS.map((item) => item.label)).toEqual(["全部", "真人剧", "漫剧", "AI 剧"]);
  });

  it("filters mock history by format, duration, time, and completion", async () => {
    const { createMockHistoryCards } = await import("../src/utils/history-view");
    const { filterHistoryItems } = await import("../src/utils/history-filter");
    const now = new Date("2026-08-16T12:00:00");
    const items = createMockHistoryCards(now);
    const titles = (
      completion: "全部" | "已看完" | "未看完",
      sheet: { format: "all" | "live" | "comic" | "ai"; duration: "all" | "gt5s" | "gt1m" | "gt5m" | "gt15m" | "gt30m"; time: "all" | "today" | "yesterday" | "month" | "quarter" | "earlier" }
    ) => filterHistoryItems(items, { completion, sheet, now }).map((item) => item.title);

    expect(titles("全部", { format: "comic", duration: "all", time: "all" })).toEqual(["春色撩撩"]);
    expect(titles("全部", { format: "ai", duration: "all", time: "all" })).toEqual(["请君入我怀"]);
    expect(titles("全部", { format: "all", duration: "gt5m", time: "all" })).toEqual(["春色撩撩", "皇后娘娘来打工"]);
    expect(titles("全部", { format: "all", duration: "all", time: "yesterday" })).toEqual(["凤栖今朝"]);
    expect(titles("全部", { format: "all", duration: "all", time: "earlier" })).toEqual(["皇后娘娘来打工"]);
    expect(titles("已看完", { format: "all", duration: "all", time: "all" })).toEqual(["皇后娘娘来打工"]);
    expect(
      filterHistoryItems(items, {
        completion: "全部",
        sheet: { format: "all", duration: "all", time: "all" },
        query: "春色"
      }).map((item) => item.title)
    ).toEqual(["春色撩撩"]);
  });

  it("assigns stable mock history drama ids and deletes selected cards from the shared store", async () => {
    const { createMockHistoryCards } = await import("../src/utils/history-view");
    const { deleteMockHistory, getMockHistoryCards, resetMockHistoryCards } = await import("../src/mocks/history-state");
    const cards = createMockHistoryCards();
    expect(cards.map((item) => item.dramaId)).toEqual(cards.map((item) => item.id));
    resetMockHistoryCards();
    expect(deleteMockHistory(["history-1", "history-1", "missing"])).toEqual(["history-1"]);
    expect(getMockHistoryCards().some((item) => item.dramaId === "history-1")).toBe(false);
    resetMockHistoryCards();
  });

  it("keeps favorite and like mock stores independent of history deletes", async () => {
    const { filterHistoryItems } = await import("../src/utils/history-filter");
    const {
      deleteMockLibraryCards,
      getMockFavoriteCards,
      getMockLikeCards,
      resetMockHistoryCards
    } = await import("../src/mocks/history-state");
    const { parseLibraryGridTab, LIBRARY_EDIT_COPY } = await import("../src/utils/inbox-view");
    resetMockHistoryCards();
    expect(parseLibraryGridTab("收藏")).toBe("收藏");
    expect(LIBRARY_EDIT_COPY.收藏.search).toBe("搜索收藏");
    expect(getMockFavoriteCards().map((item) => item.title)).toEqual(["皇后娘娘来打工", "引她入室", "凤栖今朝"]);
    expect(
      filterHistoryItems(getMockLikeCards(), {
        completion: "全部",
        sheet: { format: "comic", duration: "all", time: "all" }
      }).map((item) => item.title)
    ).toEqual(["春色撩撩"]);
    expect(deleteMockLibraryCards("收藏", ["history-4"])).toEqual(["history-4"]);
    expect(getMockFavoriteCards().some((item) => item.dramaId === "history-4")).toBe(false);
    expect(getMockLikeCards().some((item) => item.dramaId === "history-5")).toBe(true);
    resetMockHistoryCards();
  });
});
