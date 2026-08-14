import { CALLBACK_LATE_REWARD_WINDOW_SECONDS, ChallengeStatus } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { applyRewardCallback } from "./late-completion.js";

const expiresAt = new Date("2026-08-14T08:00:00.000Z");
const challenge = {
  id: "challenge-1",
  userId: "user-1",
  dramaId: "drama-1",
  status: ChallengeStatus.EXPIRED,
  expiresAt,
  grant: null,
  user: { status: "ACTIVE" }
};

function txStore(overrides: Partial<typeof challenge> = {}) {
  const row = { ...challenge, ...overrides };
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    rewardChallenge: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue(row)
    },
    entitlementGrant: {
      create: vi.fn().mockResolvedValue({ id: "grant-1" })
    },
    operationalEvent: {
      create: vi.fn().mockResolvedValue({})
    }
  };
}

describe("late reward completion", () => {
  it("marks a pending challenge verified without granting", async () => {
    const tx = txStore({ status: ChallengeStatus.PENDING });
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    await expect(
      applyRewardCallback(prisma as unknown as PrismaService, { challengeId: "challenge-1" })
    ).resolves.toBe("VERIFIED");
    expect(tx.entitlementGrant.create).not.toHaveBeenCalled();
  });

  it("grants once when an expired challenge is proven inside the delay window", async () => {
    const tx = txStore();
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const now = new Date(expiresAt.getTime() + 30 * 60 * 1000);
    await expect(
      applyRewardCallback(prisma as unknown as PrismaService, {
        challengeId: "challenge-1",
        completedAt: new Date(expiresAt.getTime() - 60_000).toISOString(),
        now
      })
    ).resolves.toBe("COMPLETED_LATE");
    expect(tx.rewardChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ChallengeStatus.COMPLETED_LATE })
      })
    );
    expect(tx.entitlementGrant.create).toHaveBeenCalledTimes(1);
  });

  it("does not guess success without a provider completion time", async () => {
    const tx = txStore();
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    await expect(
      applyRewardCallback(prisma as unknown as PrismaService, { challengeId: "challenge-1" })
    ).resolves.toBe("LATE_PROOF_MISSING");
    expect(tx.entitlementGrant.create).not.toHaveBeenCalled();
  });

  it("rejects completion after the original challenge validity", async () => {
    const tx = txStore();
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    await expect(
      applyRewardCallback(prisma as unknown as PrismaService, {
        challengeId: "challenge-1",
        completedAt: new Date(expiresAt.getTime() + 1_000).toISOString(),
        now: new Date(expiresAt.getTime() + 60_000)
      })
    ).resolves.toBe("LATE_OUTSIDE_VALIDITY");
  });

  it("rejects callbacks arriving after the late window", async () => {
    const tx = txStore();
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const now = new Date(
      expiresAt.getTime() + (CALLBACK_LATE_REWARD_WINDOW_SECONDS + 1) * 1000
    );
    await expect(
      applyRewardCallback(prisma as unknown as PrismaService, {
        challengeId: "challenge-1",
        completedAt: new Date(expiresAt.getTime() - 1_000).toISOString(),
        now
      })
    ).resolves.toBe("LATE_WINDOW_EXCEEDED");
  });
});
