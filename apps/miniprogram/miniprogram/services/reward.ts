import type { EntitlementSummary, RewardChallengeView } from "@microfocus/contracts";
import type { ClientApi } from "../types/api";
import type {
  RewardedAdCloseResult,
  RewardedAdHandle
} from "./wechat-adapter";

export interface PendingRewardConfirmation {
  challenge: RewardChallengeView;
  clientCompletedAt: string;
}

export type RewardResult =
  | { status: "completed"; entitlement: EntitlementSummary }
  | { status: "incomplete" }
  | {
      status: "confirmation_pending";
      pending: PendingRewardConfirmation;
      error: unknown;
    }
  | { status: "failed"; error: unknown };

export interface RewardFlowDependencies {
  createChallenge(): Promise<RewardChallengeView>;
  completeChallenge(
    pending: PendingRewardConfirmation
  ): Promise<EntitlementSummary>;
  createAd(adUnitId: string): RewardedAdHandle;
  wait?: (milliseconds: number) => Promise<void>;
  verificationRetryDelaysMs?: readonly number[];
}

const DEFAULT_VERIFICATION_RETRY_DELAYS_MS = [1_000, 2_000, 3_000] as const;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error: unknown): string {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : ""
  );
}

function isRetryableConfirmationError(error: unknown): boolean {
  if (errorCode(error) === "REWARD_NOT_VERIFIED") return true;
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode === 0 || error.statusCode >= 500;
  }
  return true;
}

export async function retryRewardConfirmation(
  dependencies: RewardFlowDependencies,
  pending: PendingRewardConfirmation
): Promise<RewardResult> {
  const delays =
    dependencies.verificationRetryDelaysMs ??
    DEFAULT_VERIFICATION_RETRY_DELAYS_MS;
  const wait = dependencies.wait ?? sleep;
  let lastError: unknown = new Error("奖励尚未确认");

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return {
        status: "completed",
        entitlement: await dependencies.completeChallenge(pending)
      };
    } catch (error) {
      lastError = error;
      const shouldPoll =
        pending.challenge.verificationMode === "server_verified" &&
        errorCode(error) === "REWARD_NOT_VERIFIED" &&
        attempt < delays.length;
      if (!shouldPoll) break;
      try {
        await wait(delays[attempt] ?? 0);
      } catch (waitError) {
        lastError = waitError;
        break;
      }
    }
  }

  return isRetryableConfirmationError(lastError)
    ? { status: "confirmation_pending", pending, error: lastError }
    : { status: "failed", error: lastError };
}

export async function runRewardFlow(
  dependencies: RewardFlowDependencies
): Promise<RewardResult> {
  let challenge: RewardChallengeView;
  try {
    challenge = await dependencies.createChallenge();
  } catch (error) {
    return { status: "failed", error };
  }

  const ad = dependencies.createAd(challenge.adUnitId);
  return new Promise((resolve) => {
    let settled = false;
    let listenersActive = true;

    const cleanup = () => {
      if (!listenersActive) return;
      listenersActive = false;
      ad.offClose(onClose);
      ad.offError(onError);
    };
    const settle = (result: RewardResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onError = (error: unknown) => settle({ status: "failed", error });
    const onClose = async (result: RewardedAdCloseResult) => {
      if (result?.isEnded !== true) {
        settle({ status: "incomplete" });
        return;
      }
      cleanup();
      settle(
        await retryRewardConfirmation(dependencies, {
          challenge,
          clientCompletedAt: new Date().toISOString()
        })
      );
    };

    ad.onClose(onClose);
    ad.onError(onError);
    void ad
      .show()
      .catch(() => ad.load().then(() => ad.show()))
      .catch(onError);
  });
}

export function createRewardDependencies(
  api: ClientApi,
  dramaId: string,
  sessionId: string,
  createAd: (adUnitId: string) => RewardedAdHandle
): RewardFlowDependencies {
  return {
    createChallenge: () => api.createRewardChallenge({ dramaId, sessionId }),
    completeChallenge: ({ challenge, clientCompletedAt }) =>
      api
        .completeRewardChallenge(challenge.id, {
          nonce: challenge.nonce,
          isEnded: true,
          clientCompletedAt
        })
        .then(() => api.getEntitlement(dramaId)),
    createAd
  };
}
