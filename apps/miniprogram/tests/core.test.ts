import { describe, expect, it, vi } from "vitest";
import { canStartEpisode, isFreeEpisode } from "../miniprogram/utils/episode";
import { toFriendlyErrorMessage } from "../miniprogram/utils/errors";
import { formatRemainingTime } from "../miniprogram/utils/format";
import { PlaybackHeartbeatController } from "../miniprogram/services/playback-controller";
import {
  retryRewardConfirmation,
  runRewardFlow
} from "../miniprogram/services/reward";
import { ApiClientError } from "../miniprogram/utils/errors";
import type {
  PlaybackHeartbeatResponse,
  RewardChallengeView
} from "@microfocus/contracts";
import type {
  RewardedAdCloseResult,
  RewardedAdHandle
} from "../miniprogram/services/wechat-adapter";
import {
  playerUrlFromHistory,
  toHistoryCardViews
} from "../miniprogram/utils/history-view";

describe("explicit WeChat login", () => {
  it("obtains a fresh WeChat code and persists the resulting Mock session", async () => {
    vi.resetModules();
    const storage = new Map<string, unknown>();
    const login = vi.fn((options: { success: (value: { code: string }) => void }) => {
      options.success({ code: "fresh-wechat-code" });
    });
    vi.stubGlobal("wx", {
      login,
      getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key)
    });

    const { ensureSession, getStoredSession } = await import("../miniprogram/services/api");
    const session = await ensureSession();

    expect(login).toHaveBeenCalledOnce();
    expect(session).toMatchObject({
      accessToken: "internal-mock-session-fresh-wechat",
      user: { id: "internal-user-fresh-wechat", displayName: "内部体验用户" }
    });
    expect(getStoredSession()).toMatchObject({ accessToken: "internal-mock-session-fresh-wechat" });
    vi.unstubAllGlobals();
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
    const request = vi.fn((options: { success: (response: unknown) => void }) => {
      const response = request.mock.calls.length === 1
        ? {
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
          }
        : {
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
      loadLiveHistory(): Promise<void>;
      openHistory(event: WechatMiniprogram.TouchEvent): Promise<void>;
    };
    const instance = {
      data: structuredClone(page.data),
      setData(update: Record<string, unknown>) {
        Object.assign(this.data, update);
      },
      loadLiveHistory: page.loadLiveHistory,
      openHistory: page.openHistory
    };

    await instance.loadLiveHistory();
    expect(request).toHaveBeenCalledOnce();
    const historyItems = instance.data.historyItems as Array<{ id: string; position: number }>;
    expect(historyItems).toMatchObject([{ id: "live-drama-3", position: 86 }]);

    await instance.openHistory({ currentTarget: { dataset: { id: "live-drama-3" } } } as never);
    expect(request).toHaveBeenCalledTimes(2);
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

describe("episode access", () => {
  it("keeps exactly the first two episodes free", () => {
    expect(isFreeEpisode(1)).toBe(true);
    expect(isFreeEpisode(2)).toBe(true);
    expect(isFreeEpisode(3)).toBe(false);
  });

  it("requires current-drama balance for locked episodes", () => {
    expect(canStartEpisode(3, 0)).toBe(false);
    expect(canStartEpisode(3, 1)).toBe(true);
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

  it("polls server verification with the same challenge and bounded delays", async () => {
    const pending = {
      challenge: serverVerifiedChallenge,
      clientCompletedAt: "2026-08-12T12:00:00.000Z"
    };
    const entitlement = {
      dramaId: "drama-1",
      remainingSeconds: 600,
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
    controller.setState("playing");
    controller.setNetworkAvailable(false, 1_000);
    expect(controller.shouldPauseForOffline(15_999, 15)).toBe(false);
    expect(controller.shouldPauseForOffline(16_000, 15)).toBe(true);
    controller.setState("paused");
    expect(controller.shouldPauseForOffline(30_000, 15)).toBe(false);
  });
});

describe("API error fallback", () => {
  it("returns a safe message for missing or malformed errors", () => {
    expect(toFriendlyErrorMessage(null)).toBe("服务暂时不可用，请稍后重试");
    expect(toFriendlyErrorMessage({ code: "BAD" })).toBe("服务暂时不可用，请稍后重试");
    expect(toFriendlyErrorMessage(new Error("网络超时"))).toBe("网络超时");
  });
});
