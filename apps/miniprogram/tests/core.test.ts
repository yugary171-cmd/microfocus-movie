import { describe, expect, it, vi } from "vitest";
import { canStartEpisode, isFreeEpisode } from "../miniprogram/utils/episode";
import { toFriendlyErrorMessage } from "../miniprogram/utils/errors";
import { formatApproximateRemainingEpisodes, formatRemainingTime, formatRewardUnlockCopy } from "../miniprogram/utils/format";
import { PlaybackHeartbeatController } from "../miniprogram/services/playback-controller";
import {
  describeRewardResult,
  retryRewardConfirmation,
  runRewardFlow
} from "../miniprogram/services/reward";
import { ApiClientError } from "../miniprogram/utils/errors";
import type {
  PlaybackHeartbeatResponse,
  RewardChallengeView
} from "@microfocus/contracts";
import { FREE_EPISODE_COUNT, OFFLINE_GRACE_SECONDS, PLAYBACK_RATE_MAX, PLAYBACK_RATE_MIN, REWARD_SECONDS } from "@microfocus/contracts";
import type {
  RewardedAdCloseResult,
  RewardedAdHandle
} from "../miniprogram/services/wechat-adapter";
import {
  playerUrlFromHistory,
  toHistoryCardViews
} from "../miniprogram/utils/history-view";
import { buildDramaShareCard } from "../miniprogram/utils/drama-share";
import { buildSupportPacket } from "../miniprogram/utils/support-packet";
import { sanitizeFunnelProps } from "../miniprogram/services/telemetry";
import { isCurrentTheaterVideoId, isPlaybackTap, PLAYBACK_HOLD_MS, PLAYBACK_TAP_MAX_MS, PLAYBACK_TAP_MOVE_MAX_PX, holdBoostRate, restoreHoldRate, shouldStartHoldBoost, theaterVideoId } from "../miniprogram/utils/playback-gesture";
import {
  applyProfilePatch,
  boundNickname,
  canSaveNickname,
  canSaveSignature,
  formatMicrofocusId
} from "../miniprogram/utils/profile";

describe("playback tap gesture", () => {
  it("treats a short still touch as tap and ignores swipe or long press", () => {
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

describe("theater video event ownership", () => {
  it("ignores delayed playback events from a previously active slide", () => {
    expect(theaterVideoId(2)).toBe("theater-video-2");
    expect(isCurrentTheaterVideoId("theater-video-2", 2)).toBe(true);
    expect(isCurrentTheaterVideoId("theater-video-1", 2)).toBe(false);
  });
});

describe("explicit WeChat login", () => {
  it("obtains a fresh WeChat code and persists the resulting Mock session", async () => {
    vi.resetModules();
    const storage = new Map<string, unknown>();
    const login = vi.fn((options: { success: (value: { code: string }) => void }) => {
      options.success({ code: "fresh-wechat-code" });
    });
    const getUserProfile = vi.fn(
      (options: {
        success: (value: { userInfo: { nickName: string; avatarUrl: string } }) => void;
      }) => {
        options.success({ userInfo: { nickName: "内部体验用户", avatarUrl: "" } });
      }
    );
    vi.stubGlobal("wx", {
      login,
      getUserProfile,
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key)
    });

    const { ensureSession, getStoredSession, clearStoredSession } = await import("../miniprogram/services/api");
    const session = await ensureSession();

    expect(login).toHaveBeenCalledOnce();
    expect(session).toMatchObject({
      accessToken: "internal-mock-session-fresh-wechat",
      user: { id: "internal-user-fresh-wechat", displayName: "内部体验用户" }
    });
    expect(getStoredSession()).toMatchObject({ accessToken: "internal-mock-session-fresh-wechat" });
    clearStoredSession();
    expect(getStoredSession()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("applies the WeChat nickname locally after a Mock session is stored", async () => {
    vi.resetModules();
    const storage = new Map<string, unknown>();
    vi.stubGlobal("wx", {
      login: (options: { success: (value: { code: string }) => void }) => {
        options.success({ code: "fresh-wechat-code" });
      },
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key)
    });
    const { ensureSession, applyLocalWechatProfile, getStoredSession } = await import(
      "../miniprogram/services/api"
    );
    await ensureSession();
    applyLocalWechatProfile({ displayName: "Stellan", avatarUrl: "https://example.com/a.png" });
    expect(getStoredSession()?.user).toMatchObject({
      displayName: "Stellan",
      avatarUrl: "https://example.com/a.png"
    });
    vi.unstubAllGlobals();
  });

  it("treats WeChat nickname authorization cancel as a denied profile", async () => {
    vi.resetModules();
    vi.stubGlobal("wx", {
      getUserProfile: (options: { fail: (error: { errMsg: string }) => void }) => {
        options.fail({ errMsg: "getUserProfile:fail auth deny" });
      }
    });
    const { isWechatProfileAuthorizationDenied, wechatAdapter } = await import(
      "../miniprogram/services/wechat-adapter"
    );
    await expect(wechatAdapter.getUserProfile()).rejects.toSatisfy((error: unknown) =>
      isWechatProfileAuthorizationDenied(error)
    );
    vi.unstubAllGlobals();
  });

  it("recognizes the DevTools avatar metadata failure separately from denial", async () => {
    vi.resetModules();
    const { isWechatProfileAuthorizationDenied, isWechatProfileUnavailable } = await import(
      "../miniprogram/services/wechat-adapter"
    );
    const error = new Error("getUserProfile:fail getUserAvatarInfo fail");
    expect(isWechatProfileUnavailable(error)).toBe(true);
    expect(isWechatProfileAuthorizationDenied(error)).toBe(false);
  });
});

describe("live watch-history navigation", () => {
  it("maps real API history and preserves the resume position in the player route", () => {
    const cards = toHistoryCardViews([{
      drama: {
        id: "live-drama",
        title: "真实播放记录",
        summary: "",
        coverUrl: "",
        category: "都市",
        tags: [],
        episodeCount: 12,
        recommendationRank: 1
      },
      episodeNumber: 3,
      mediaPositionSeconds: 86,
      updatedAt: "2026-08-13T00:00:00.000Z"
    }]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ dramaId: "live-drama", episodeNumber: 3, position: 86 });
    expect(playerUrlFromHistory(cards[0]!, "episode-3")).toContain(
      "dramaId=live-drama&episodeId=episode-3&title=%E7%9C%9F%E5%AE%9E%E6%92%AD%E6%94%BE%E8%AE%B0%E5%BD%95&episodeNumber=3&position=86"
    );
  });

  it("loads live history in the My page and resumes the selected episode", async () => {
    vi.resetModules();
    const storage = new Map<string, unknown>([
      ["microfocus.access-token", "live-token"],
      ["microfocus.session-user", { id: "live-user", displayName: "真实用户", avatarUrl: null }]
    ]);
    const navigateTo = vi.fn();
    let pageDefinition: Record<string, unknown> | undefined;
    const request = vi.fn((options: { url?: string; success: (response: unknown) => void }) => {
      const url = options.url || "";
      const historyPayload = {
        statusCode: 200,
        data: {
          data: [{
            drama: {
              id: "live-drama",
              title: "真实播放记录",
              summary: "",
              coverUrl: "",
              category: "都市",
              tags: [],
              episodeCount: 12,
              recommendationRank: 1
            },
            episodeNumber: 3,
            mediaPositionSeconds: 86,
            updatedAt: "2026-08-13T00:00:00.000Z"
          }],
          requestId: "history-request"
        },
        header: {}
      };
      const dramaPayload = {
        statusCode: 200,
        data: {
          data: {
            id: "live-drama",
            title: "真实播放记录",
            episodes: [{ id: "episode-3", episodeNumber: 3 }]
          },
          requestId: "drama-request"
        },
        header: {}
      };
      const emptyPage = {
        statusCode: 200,
        data: {
          data: { items: [], page: 1, hasMore: false },
          requestId: "social-request"
        },
        header: {}
      };
      const userPayload = {
        statusCode: 200,
        data: {
          data: {
            id: "live-user",
            displayName: "真实用户",
            avatarUrl: null,
            signature: "",
            gender: "unset",
            followerCount: 0,
            followingCount: 0,
            receivedCommentLikeCount: 0,
            followedByMe: false
          },
          requestId: "user-request"
        },
        header: {}
      };
      const response = url.includes("/v1/me/history")
        ? historyPayload
        : url.includes("/v1/dramas/")
          ? dramaPayload
          : url.includes("/v1/users/")
            ? userPayload
            : emptyPage;
      options.success(response);
    });
    vi.stubEnv("MICROFOCUS_TEST_API_BASE_URL", "https://api.test");
    vi.stubGlobal("Page", (definition: Record<string, unknown>) => {
      pageDefinition = definition;
    });
    vi.stubGlobal("wx", {
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "trial" } }),
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request,
      navigateTo,
      showToast: vi.fn(),
      switchTab: vi.fn()
    });

    vi.doMock("../miniprogram/config/runtime", () => ({
      RUNTIME_CONFIG: {
        apiBaseUrl: "https://api.test",
        requestTimeoutMs: 10_000,
        productName: "微焦短剧",
        demoVideoUrl: "",
        demoVideoTwoUrl: "",
        demoVideoUrls: []
      }
    }));
    await import("../miniprogram/pages/my/index");
    expect(pageDefinition).toBeDefined();
    const page = pageDefinition as {
      data: Record<string, unknown>;
      loadLibrary(): Promise<void>;
      openHistory(event: WechatMiniprogram.TouchEvent): Promise<void>;
    };
    const instance = {
      data: {
        ...structuredClone(page.data),
        user: {
          displayName: "真实用户",
          microfocusId: "微焦号 · LIVE-USER",
          initial: "真",
          avatarUrl: ""
        }
      },
      setData(update: Record<string, unknown>) {
        Object.assign(this.data, update);
      },
      loadLibrary: page.loadLibrary,
      openHistory: page.openHistory
    };

    await instance.loadLibrary();
    expect(request.mock.calls.some((call) => String(call[0]?.url || "").includes("/v1/me/history"))).toBe(true);
    const historyItems = instance.data.historyItems as Array<{ id: string; position: number }>;
    expect(historyItems).toMatchObject([{ id: "live-drama-3", position: 86 }]);

    await instance.openHistory({ currentTarget: { dataset: { id: "live-drama-3" } } } as never);
    expect(request.mock.calls.some((call) => String(call[0]?.url || "").includes("/v1/dramas/"))).toBe(true);
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining("episodeId=episode-3")
    }));
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining("position=86")
    }));
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.doUnmock("../miniprogram/config/runtime");
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

function heartbeatResponse(
  acknowledgedSeq: number
): PlaybackHeartbeatResponse {
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
    expect(fake.ad.offClose).toHaveBeenCalledOnce();
    expect(fake.ad.offError).toHaveBeenCalledOnce();
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
    const notVerified = new ApiClientError(
      "奖励尚未由服务端确认",
      "REWARD_NOT_VERIFIED",
      409
    );
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
    expect(
      completeChallenge.mock.calls.every(([value]) => value === pending)
    ).toBe(true);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("keeps the same pending challenge after bounded verification retries", async () => {
    const pending = {
      challenge: serverVerifiedChallenge,
      clientCompletedAt: "2026-08-12T12:00:00.000Z"
    };
    const error = new ApiClientError(
      "奖励尚未由服务端确认",
      "REWARD_NOT_VERIFIED",
      409
    );
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

    expect(result).toEqual({
      status: "confirmation_pending",
      pending,
      error
    });
    expect(completeChallenge).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls).toEqual([[1_000], [2_000], [3_000]]);
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
    ).resolves.toEqual({
      status: "confirmation_pending",
      pending,
      error
    });
  });

  it("never creates a second challenge when retrying pending confirmation", async () => {
    const fake = createFakeAd();
    const error = new ApiClientError(
      "奖励尚未由服务端确认",
      "REWARD_NOT_VERIFIED",
      409
    );
    const createChallenge = vi.fn().mockResolvedValue(serverVerifiedChallenge);
    const completeChallenge = vi.fn().mockRejectedValue(error);
    const dependencies = {
      createChallenge,
      completeChallenge,
      createAd: () => fake.ad,
      wait: vi.fn().mockResolvedValue(undefined),
      verificationRetryDelaysMs: []
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
    expect(completeChallenge.mock.calls[0]?.[0]).toBe(initialResult.pending);
    expect(completeChallenge.mock.calls[1]?.[0]).toBe(initialResult.pending);
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
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      seq: 1,
      mediaPositionSeconds: 5,
      previousMediaPositionSeconds: 0,
      state: "playing"
    }));
    controller.setPosition(10);
    await expect(controller.tick(send)).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      seq: 2,
      mediaPositionSeconds: 10,
      previousMediaPositionSeconds: 5
    }));
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
    expect(send).toHaveBeenCalledTimes(1);

    slow.resolve(heartbeatResponse(1));
    await expect(firstTick).resolves.toMatchObject({ status: "confirmed" });
    send.mockResolvedValueOnce(heartbeatResponse(2));
    await controller.tick(send);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        seq: 2,
        previousMediaPositionSeconds: 5,
        mediaPositionSeconds: 10
      })
    );
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
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      seq: 1,
      previousMediaPositionSeconds: 2,
      mediaPositionSeconds: 7
    });
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
    expect(send).toHaveBeenCalledTimes(1);
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

describe("share and support packet", () => {
  it("does not build an exportable share card in Mock", () => {
    expect(
      buildDramaShareCard({
        isMock: true,
        drama: { id: "d1", title: "内部剧", summary: "s", coverUrl: "https://example.com/c.png" }
      })
    ).toBeNull();
  });

  it("omits secrets from support packets and funnel props", () => {
    expect(buildSupportPacket({ challengeId: "c1" })).toContain("challengeId: c1");
    expect(sanitizeFunnelProps({ session_key: "k", dramaId: "d1" })).toEqual({ dramaId: "d1" });
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
    const { mockApi } = await import("../miniprogram/mocks/data");
    await mockApi.authWechat("fresh-wechat-code");
    await mockApi.updateProfile({ displayName: "新昵称", signature: "介绍一下自己", gender: "female" });
    await expect(mockApi.getProfile()).resolves.toMatchObject({
      displayName: "新昵称",
      signature: "介绍一下自己",
      gender: "female"
    });
  });

  it("hydrates mock profile from a restored session without a new login", async () => {
    const { resetMockProfile, syncMockProfile } = await import("../miniprogram/mocks/profile-state");
    const { mockApi } = await import("../miniprogram/mocks/data");
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

describe("my page inbox", () => {
  it("places messages after likes and keeps five local categories", async () => {
    const { INBOX_ITEMS, INBOX_TAB, LIBRARY_TABS } = await import("../miniprogram/utils/inbox-view");
    expect([...LIBRARY_TABS]).toEqual(["历史", "收藏", "点赞", INBOX_TAB]);
    expect(INBOX_ITEMS.map((item) => item.title)).toEqual([
      "系统通知",
      "粉丝消息",
      "评论消息",
      "我的评论",
      "赞"
    ]);
  });

  it("summarizes inbox rows from the latest social items", async () => {
    const { applyInboxLatest, cloneInboxItems } = await import("../miniprogram/utils/inbox-view");
    const rows = applyInboxLatest(cloneInboxItems(), {
      fansName: "阿焦",
      fansAt: "2026-08-17T01:00:00.000Z",
      commentPreview: "路人：这部好看",
      commentAt: "2026-08-17T02:00:00.000Z",
      minePreview: "我刚看完",
      mineAt: "2026-08-17T03:00:00.000Z",
      likeName: "小微",
      likeAt: "2026-08-17T04:00:00.000Z"
    });
    expect(rows.find((item) => item.id === "fans")?.preview).toBe("阿焦 关注了你");
    expect(rows.find((item) => item.id === "comments")?.preview).toBe("路人：这部好看");
    expect(rows.find((item) => item.id === "mine")?.preview).toBe("我刚看完");
    expect(rows.find((item) => item.id === "likes")?.preview).toBe("小微 赞了你的评论");
    expect(rows.find((item) => item.id === "system")?.preview).toContain("隐私政策");
  });
});

describe("watch history filters", () => {
  it("keeps only live-action, comic, and AI format chips", async () => {
    const { HISTORY_FORMAT_OPTIONS } = await import("../miniprogram/utils/history-filter");
    expect(HISTORY_FORMAT_OPTIONS.map((item) => item.label)).toEqual(["全部", "真人剧", "漫剧", "AI 剧"]);
  });

  it("filters mock history by format, duration, time, and completion", async () => {
    const { createMockHistoryCards } = await import("../miniprogram/utils/history-view");
    const { filterHistoryItems } = await import("../miniprogram/utils/history-filter");
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
    const { createMockHistoryCards } = await import("../miniprogram/utils/history-view");
    const { deleteMockHistory, getMockHistoryCards, resetMockHistoryCards } = await import("../miniprogram/mocks/history-state");
    const cards = createMockHistoryCards();
    expect(cards.map((item) => item.dramaId)).toEqual(cards.map((item) => item.id));
    resetMockHistoryCards();
    expect(deleteMockHistory(["history-1", "history-1", "missing"])).toEqual(["history-1"]);
    expect(getMockHistoryCards().some((item) => item.dramaId === "history-1")).toBe(false);
    resetMockHistoryCards();
  });

  it("keeps favorite and like mock stores independent of history deletes", async () => {
    const { filterHistoryItems } = await import("../miniprogram/utils/history-filter");
    const {
      deleteMockLibraryCards,
      getMockFavoriteCards,
      getMockLikeCards,
      resetMockHistoryCards
    } = await import("../miniprogram/mocks/history-state");
    const { parseLibraryGridTab, LIBRARY_EDIT_COPY } = await import("../miniprogram/utils/inbox-view");
    resetMockHistoryCards();
    expect(parseLibraryGridTab("点赞")).toBe("点赞");
    expect(LIBRARY_EDIT_COPY.点赞.search).toBe("搜索点赞");
    expect(LIBRARY_EDIT_COPY.收藏.mockLabel).toBe("内部体验收藏");
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

  it("exposes mock favorites through the social client", async () => {
    const { resetMockHistoryCards, getMockFavoriteCards } = await import("../miniprogram/mocks/history-state");
    const { writeMockProfile } = await import("../miniprogram/mocks/profile-state");
    const { createMockSocialApi } = await import("../miniprogram/mocks/social-api");
    resetMockHistoryCards();
    writeMockProfile({
      id: "mock-user",
      displayName: "体验用户",
      avatarUrl: null,
      signature: "",
      gender: "unset"
    });
    const social = createMockSocialApi();
    const page = await social.getFavorites(1);
    expect(page.items.map((item) => item.drama.id)).toEqual(getMockFavoriteCards().map((item) => item.dramaId));
    await social.createDramaComment("drama-inbox", { body: "刚看完" });
    const mine = await social.getMeComments(1);
    expect(mine.items[0]?.body).toBe("刚看完");
    resetMockHistoryCards();
  });
});

describe("discover filters and ranking", () => {
  it("collapses recommendation audience and time rows and keeps four ranking types", async () => {
    const { RANKING_TABS, RANKING_TYPES, visibleDiscoverSections } = await import("../miniprogram/utils/discover");
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
