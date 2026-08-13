import { Body, Controller, Headers, Module, Post, Req } from "@nestjs/common";
import { IsIn, IsString } from "class-validator";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyWebhookSignature, WechatProviderService } from "../providers/providers.js";

const CALLBACK_LEASE_MS = 30_000;

class VodCallbackDto {
  @IsString() eventId!: string;
  @IsString() fileId!: string;
  @IsIn(["READY", "FAILED"]) mediaStatus!: "READY" | "FAILED";
  @IsIn(["READY", "FAILED"]) transcodeStatus!: "READY" | "FAILED";
  @IsIn(["APPROVED", "REJECTED"])
  machineReviewStatus!: "APPROVED" | "REJECTED";
}

class RewardCallbackDto {
  @IsString() eventId!: string;
  @IsString() challengeId!: string;
}

@Controller("v1/callbacks")
export class CallbacksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly wechat: WechatProviderService
  ) {}

  @Post("vod")
  async vod(
    @Req() request: RawBodyRequest,
    @Headers("x-provider-signature") signature: string | undefined,
    @Body() body: VodCallbackDto
  ) {
    this.assertSignature(
      request.rawBody,
      signature,
      this.config.env.TENCENTCLOUD_VOD_CALLBACK_SECRET
    );
    assertValidVodState(body);
    const claim = await claimCallbackEvent(
      this.prisma,
      body.eventId,
      "VOD",
      "MEDIA_UPDATED"
    );
    if (claim === "processed") return { accepted: true, duplicate: true };
    if (claim === "busy") {
      throw Errors.conflict("CALLBACK_IN_PROGRESS", "Callback is already being processed");
    }

    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        const asset = await tx.mediaAsset.findUnique({
          where: { fileId: body.fileId },
          include: { episode: { include: { drama: true } } }
        });
        if (!asset) return "MEDIA_NOT_FOUND";
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: {
            mediaStatus: body.mediaStatus,
            transcodeStatus: body.transcodeStatus,
            machineReviewStatus: body.machineReviewStatus
          }
        });
        const failed =
          body.mediaStatus === "FAILED" ||
          body.transcodeStatus === "FAILED" ||
          body.machineReviewStatus === "REJECTED" ||
          asset.manualReviewStatus === "REJECTED" ||
          asset.wechatReviewStatus === "REJECTED";
        if (failed && asset.episode.drama.status === "PUBLISHED") {
          const now = new Date();
          await tx.drama.update({
            where: { id: asset.episode.dramaId },
            data: { status: "OFFLINE" }
          });
          const episodes = await tx.episode.findMany({
            where: { dramaId: asset.episode.dramaId },
            select: { id: true }
          });
          await tx.playbackLease.updateMany({
            where: {
              episodeId: { in: episodes.map((episode) => episode.id) },
              status: "ACTIVE"
            },
            data: { status: "REVOKED", activeKey: null, revokedAt: now }
          });
          return "PROCESSED_EMERGENCY_OFFLINE";
        }
        return "PROCESSED";
      });
      await finishCallbackEvent(this.prisma, body.eventId, outcome);
      return { accepted: true, duplicate: false };
    } catch (error) {
      await releaseCallbackEvent(this.prisma, body.eventId, "RETRYABLE_FAILURE");
      throw error;
    }
  }

  @Post("reward")
  async reward(
    @Req() request: RawBodyRequest,
    @Headers("x-provider-signature") signature: string | undefined,
    @Body() body: RewardCallbackDto
  ) {
    this.assertSignature(
      request.rawBody,
      signature,
      this.config.env.WECHAT_CALLBACK_SECRET
    );
    const claim = await claimCallbackEvent(
      this.prisma,
      body.eventId,
      "WECHAT",
      "REWARD_COMPLETED"
    );
    if (claim === "processed") return { accepted: true, duplicate: true };
    if (claim === "busy") {
      throw Errors.conflict("CALLBACK_IN_PROGRESS", "Callback is already being processed");
    }
    try {
      const verified = await this.wechat.verifyReward({
        challengeId: body.challengeId,
        eventId: body.eventId
      });
      if (!verified) {
        await finishCallbackEvent(this.prisma, body.eventId, "REJECTED");
        throw Errors.forbidden(
          "REWARD_VERIFICATION_FAILED",
          "Reward callback could not be verified"
        );
      }
      const updated = await this.prisma.rewardChallenge.updateMany({
        where: { id: body.challengeId, status: "PENDING" },
        data: { verificationMode: "server_verified", verifiedAt: new Date() }
      });
      await finishCallbackEvent(
        this.prisma,
        body.eventId,
        updated.count ? "VERIFIED" : "CHALLENGE_NOT_PENDING"
      );
      return { accepted: true, duplicate: false };
    } catch (error) {
      if (isTerminalCallbackError(error)) throw error;
      await releaseCallbackEvent(this.prisma, body.eventId, "RETRYABLE_FAILURE");
      throw error;
    }
  }

  private assertSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    secret: string | undefined
  ): void {
    if (
      this.config.env.NODE_ENV === "production" &&
      (!rawBody || !verifyWebhookSignature(rawBody.toString("utf8"), signature, secret))
    ) {
      throw Errors.unauthorized("Invalid callback signature");
    }
  }
}

export type CallbackClaim = "claimed" | "busy" | "processed";

export async function claimCallbackEvent(
  prisma: CallbackStore,
  id: string,
  provider: string,
  eventType: string,
  now = new Date()
): Promise<CallbackClaim> {
  const processingUntil = new Date(now.getTime() + CALLBACK_LEASE_MS);
  try {
    await prisma.callbackEvent.create({
      data: { id, provider, eventType, processingUntil, attempts: 1 }
    });
    return "claimed";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const existing = await prisma.callbackEvent.findUnique({ where: { id } });
  if (existing?.processedAt) return "processed";
  const claimed = await prisma.callbackEvent.updateMany({
    where: {
      id,
      processedAt: null,
      OR: [{ processingUntil: null }, { processingUntil: { lte: now } }]
    },
    data: {
      processingUntil,
      attempts: { increment: 1 },
      outcome: "RETRYING"
    }
  });
  return claimed.count === 1 ? "claimed" : "busy";
}

async function finishCallbackEvent(
  prisma: CallbackStore,
  id: string,
  outcome: string
): Promise<void> {
  await prisma.callbackEvent.update({
    where: { id },
    data: { outcome, processedAt: new Date(), processingUntil: null }
  });
}

async function releaseCallbackEvent(
  prisma: CallbackStore,
  id: string,
  outcome: string
): Promise<void> {
  await prisma.callbackEvent.updateMany({
    where: { id, processedAt: null },
    data: { outcome, processingUntil: null }
  });
}

function assertValidVodState(body: VodCallbackDto): void {
  if (
    body.mediaStatus === "READY" &&
    (body.transcodeStatus !== "READY" || body.machineReviewStatus !== "APPROVED")
  ) {
    throw Errors.badRequest(
      "INVALID_MEDIA_STATE",
      "READY media requires ready transcode and approved machine review"
    );
  }
}

type CallbackStore = {
  callbackEvent: {
    create(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<{
      processedAt: Date | null;
      processingUntil: Date | null;
    } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
  };
};

type RawBodyRequest = { rawBody?: Buffer };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
  );
}

function isTerminalCallbackError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "REWARD_VERIFICATION_FAILED"
  );
}

@Module({ controllers: [CallbacksController] })
export class CallbacksModule {}
