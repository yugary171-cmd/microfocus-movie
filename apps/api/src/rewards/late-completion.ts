import {
  CALLBACK_LATE_REWARD_WINDOW_SECONDS,
  ChallengeStatus,
  REWARD_SECONDS,
  REWARD_TTL_SECONDS
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service.js";

export type RewardCallbackOutcome =
  | "VERIFIED"
  | "ALREADY_COMPLETED"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_NOT_PENDING"
  | "LATE_PROOF_MISSING"
  | "LATE_OUTSIDE_VALIDITY"
  | "LATE_WINDOW_EXCEEDED"
  | "ACCOUNT_UNAVAILABLE"
  | "COMPLETED_LATE";

export async function applyRewardCallback(
  prisma: PrismaService,
  input: {
    challengeId: string;
    completedAt?: string;
    now?: Date;
  }
): Promise<RewardCallbackOutcome> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM RewardChallenge WHERE id = ${input.challengeId} FOR UPDATE`;
    const challenge = await tx.rewardChallenge.findUnique({
      where: { id: input.challengeId },
      include: { grant: true, user: { select: { status: true } } }
    });
    if (!challenge) return "CHALLENGE_NOT_FOUND";
    if (challenge.status === ChallengeStatus.PENDING) {
      await tx.rewardChallenge.update({
        where: { id: challenge.id },
        data: { verificationMode: "server_verified", verifiedAt: now }
      });
      return "VERIFIED";
    }
    if (
      challenge.status === ChallengeStatus.COMPLETED ||
      challenge.status === ChallengeStatus.COMPLETED_LATE
    ) {
      return "ALREADY_COMPLETED";
    }
    if (challenge.status !== ChallengeStatus.EXPIRED) return "CHALLENGE_NOT_PENDING";
    if (challenge.grant) return "ALREADY_COMPLETED";
    if (challenge.user.status !== "ACTIVE") return "ACCOUNT_UNAVAILABLE";

    const completedAt = parseCompletedAt(input.completedAt);
    if (!completedAt) return "LATE_PROOF_MISSING";
    if (completedAt > challenge.expiresAt) return "LATE_OUTSIDE_VALIDITY";
    const windowEnd = new Date(
      challenge.expiresAt.getTime() + CALLBACK_LATE_REWARD_WINDOW_SECONDS * 1000
    );
    if (now > windowEnd) return "LATE_WINDOW_EXCEEDED";

    try {
      const grant = await tx.entitlementGrant.create({
        data: {
          userId: challenge.userId,
          dramaId: challenge.dramaId,
          challengeId: challenge.id,
          source: "REWARDED_AD",
          grantedSeconds: REWARD_SECONDS,
          remainingSeconds: REWARD_SECONDS,
          expiresAt: new Date(now.getTime() + REWARD_TTL_SECONDS * 1000)
        }
      });
      await tx.rewardChallenge.update({
        where: { id: challenge.id },
        data: {
          status: ChallengeStatus.COMPLETED_LATE,
          completedAt: now,
          verifiedAt: now,
          verificationMode: "server_verified",
          pendingKey: null
        }
      });
      await tx.operationalEvent.create({
        data: {
          eventType: "ENTITLEMENT_GRANTED_LATE",
          actorType: "SYSTEM",
          actorId: challenge.userId,
          entityType: "EntitlementGrant",
          entityId: grant.id,
          value: REWARD_SECONDS
        }
      });
      return "COMPLETED_LATE";
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return "ALREADY_COMPLETED";
      }
      throw error;
    }
  });
}

function parseCompletedAt(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}
