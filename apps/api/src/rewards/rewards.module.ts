import { createHash, randomBytes } from "node:crypto";
import { Body, Controller, Headers, Module, Param, Post, UseGuards } from "@nestjs/common";
import {
  API_ROUTES,
  REWARD_SECONDS,
  REWARD_TTL_SECONDS,
  type CreateRewardChallengeRequest,
  type RewardChallengeView
} from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { IsBoolean, IsISO8601, IsString, MinLength } from "class-validator";
import { controllerPath } from "../common/http.js";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
import { requireUser } from "../history/history.module.js";
import { assertCircuitsClosed } from "../domain/circuit.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  CurrentPrincipal,
  JwtAuthGuard,
  type Principal
} from "../security/security.js";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;

class CreateChallengeDto implements CreateRewardChallengeRequest {
  @IsString()
  dramaId!: string;

  @IsString()
  @MinLength(1)
  sessionId!: string;
}

class CompleteChallengeDto {
  @IsString()
  nonce!: string;

  @IsBoolean()
  isEnded!: true;

  @IsISO8601()
  clientCompletedAt!: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService
  ) {}

  @Post(controllerPath(API_ROUTES.rewardChallenges))
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateChallengeDto
  ): Promise<RewardChallengeView> {
    const userId = requireUser(principal);
    await assertCircuitsClosed(this.prisma, {
      userId,
      dramaId: body.dramaId,
      adUnitId: this.config.env.WECHAT_REWARDED_AD_UNIT_ID
    });
    if (
      this.config.env.WECHAT_REWARD_VERIFICATION === "client_attestation" &&
      !this.config.clientAttestationAllowed
    ) {
      throw Errors.forbidden(
        "CLIENT_ATTESTATION_FORBIDDEN",
        "Client attestation is restricted to non-production or internal traffic"
      );
    }
    const now = new Date();
    const drama = await this.prisma.drama.findFirst({
      where: {
        id: body.dramaId,
        status: "PUBLISHED",
        rightsRecords: { some: { status: "ACTIVE", validUntil: { gt: now } } }
      }
    });
    if (!drama) throw Errors.notFound("Drama");

    await this.prisma.rewardChallenge.updateMany({
      where: { userId, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", pendingKey: null }
    });
    const pending = await this.prisma.rewardChallenge.findFirst({
      where: { userId, status: "PENDING", expiresAt: { gt: now } }
    });
    if (pending) throw Errors.conflict("CHALLENGE_PENDING", "A challenge is already pending");
    const recent = await this.prisma.rewardChallenge.count({
      where: { userId, createdAt: { gte: new Date(now.getTime() - RATE_WINDOW_MS) } }
    });
    if (recent >= 3) throw Errors.rateLimited("At most three challenges may be created per five minutes");

    const nonce = randomBytes(32).toString("base64url");
    try {
      const challenge = await this.prisma.rewardChallenge.create({
        data: {
          userId,
          dramaId: body.dramaId,
          sessionId: body.sessionId.slice(0, 128),
          nonceHash: hash(nonce),
          pendingKey: userId,
          verificationMode: this.config.env.WECHAT_REWARD_VERIFICATION,
          expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS)
        }
      });
      return {
        id: challenge.id,
        nonce,
        expiresAt: challenge.expiresAt.toISOString(),
        adUnitId: this.config.env.WECHAT_REWARDED_AD_UNIT_ID,
        verificationMode: challenge.verificationMode as RewardChallengeView["verificationMode"]
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw Errors.conflict("CHALLENGE_PENDING", "A challenge is already pending");
      }
      throw error;
    }
  }

  @Post("v1/rewards/challenges/:challengeId/complete")
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param("challengeId") challengeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CompleteChallengeDto
  ) {
    const userId = requireUser(principal);
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw Errors.badRequest("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required");
    }
    if (!body.isEnded) throw Errors.badRequest("AD_NOT_COMPLETED", "The rewarded ad was not completed");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM RewardChallenge WHERE id = ${challengeId} FOR UPDATE`;
      const challenge = await tx.rewardChallenge.findFirst({
        where: { id: challengeId, userId },
        include: { grant: true }
      });
      if (!challenge) throw Errors.notFound("Reward challenge");
      await assertCircuitsClosed(tx, {
        userId,
        dramaId: challenge.dramaId,
        adUnitId: this.config.env.WECHAT_REWARDED_AD_UNIT_ID
      });
      if (challenge.grant) return grantResult(challenge.grant);
      if (challenge.status !== "PENDING") {
        throw Errors.conflict("CHALLENGE_NOT_PENDING", "Challenge cannot be completed");
      }
      const now = new Date();
      if (challenge.expiresAt <= now) {
        await tx.rewardChallenge.update({
          where: { id: challenge.id },
          data: { status: "EXPIRED", pendingKey: null }
        });
        throw Errors.conflict("CHALLENGE_EXPIRED", "Challenge has expired");
      }
      if (challenge.nonceHash !== hash(body.nonce)) {
        throw Errors.badRequest("INVALID_CHALLENGE_NONCE", "Challenge nonce is invalid");
      }
      if (challenge.verificationMode === "server_verified" && !challenge.verifiedAt) {
        throw Errors.conflict(
          "REWARD_NOT_VERIFIED",
          "The rewarded ad has not yet been verified by the provider"
        );
      }
      const grant = await tx.entitlementGrant.create({
        data: {
          userId,
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
          status: "COMPLETED",
          completedAt: now,
          pendingKey: null,
          completionKey: idempotencyKey
        }
      });
      await tx.operationalEvent.create({
        data: {
          eventType: "ENTITLEMENT_GRANTED",
          actorType: "USER",
          actorId: userId,
          entityType: "EntitlementGrant",
          entityId: grant.id,
          value: REWARD_SECONDS
        }
      });
      return grantResult(grant);
    });
  }
}

function grantResult(grant: {
  id: string;
  grantedSeconds: number;
  remainingSeconds: number;
  expiresAt: Date;
}) {
  return {
    grantId: grant.id,
    grantedSeconds: grant.grantedSeconds,
    remainingSeconds: Math.max(0, grant.remainingSeconds),
    expiresAt: grant.expiresAt.toISOString()
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Module({ controllers: [RewardsController] })
export class RewardsModule {}
