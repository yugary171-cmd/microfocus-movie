import { Body, Controller, Headers, Module, Post, Req } from "@nestjs/common";
import { CALLBACK_MAX_ATTEMPTS, CallbackEventStatus, ERROR_CODES } from "@microfocus/contracts";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { applyRewardCallback } from "../rewards/late-completion.js";
import { Errors } from "../common/app-error.js";
import { assertCircuitsClosed, openProviderCircuit } from "../domain/circuit.js";
import { AppConfigService } from "../config/config.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyWebhookSignature, WechatProviderService } from "../providers/providers.js";
import { assertNamedRateLimit, requestIpKey } from "../security/rate-limit.js";
import { applyVodCallback } from "./callback-apply-vod.js";
import {
  buildStoredEnvelope,
  CALLBACK_PAYLOAD_REWARD_V1,
  CALLBACK_PAYLOAD_VOD_V1,
  resolvePayloadEncryptionKey,
  withEncryptionKey,
  type StoredCallbackEnvelope
} from "./callback-payload.js";

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
  @IsOptional()
  @IsISO8601()
  completedAt?: string;
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
    await assertNamedRateLimit(this.prisma, "callbackVod", requestIpKey(request));
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
      "MEDIA_UPDATED",
      buildStoredEnvelope({
        ...withEncryptionKey(resolvePayloadEncryptionKey(this.config.env)),
        ...(request.rawBody ? { rawBody: request.rawBody } : {}),
        schema: CALLBACK_PAYLOAD_VOD_V1,
        body
      })
    );
    if (claim === "processed") return { accepted: true, duplicate: true };
    if (claim === "dead_letter") {
      throw Errors.conflict(
        ERROR_CODES.CALLBACK_DEAD_LETTER,
        "Callback is in dead letter and must be replayed by an admin"
      );
    }
    if (claim === "busy") {
      throw Errors.conflict("CALLBACK_IN_PROGRESS", "Callback is already being processed");
    }

    try {
      const outcome = await applyVodCallback(this.prisma, body);
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
    await assertNamedRateLimit(this.prisma, "callbackReward", requestIpKey(request));
    this.assertSignature(
      request.rawBody,
      signature,
      this.config.env.WECHAT_CALLBACK_SECRET
    );
    const claim = await claimCallbackEvent(
      this.prisma,
      body.eventId,
      "WECHAT",
      "REWARD_COMPLETED",
      buildStoredEnvelope({
        ...withEncryptionKey(resolvePayloadEncryptionKey(this.config.env)),
        ...(request.rawBody ? { rawBody: request.rawBody } : {}),
        schema: CALLBACK_PAYLOAD_REWARD_V1,
        body
      })
    );
    if (claim === "processed") return { accepted: true, duplicate: true };
    if (claim === "dead_letter") {
      throw Errors.conflict(
        ERROR_CODES.CALLBACK_DEAD_LETTER,
        "Callback is in dead letter and must be replayed by an admin"
      );
    }
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
      const outcome = await applyRewardCallback(this.prisma, {
        challengeId: body.challengeId,
        ...(body.completedAt ? { completedAt: body.completedAt } : {})
      });
      await finishCallbackEvent(this.prisma, body.eventId, outcome);
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

export type CallbackClaim = "claimed" | "busy" | "processed" | "dead_letter";

const TERMINAL_STATUSES = new Set<string>([
  CallbackEventStatus.PROCESSED,
  CallbackEventStatus.REJECTED
]);

export async function claimCallbackEvent(
  prisma: CallbackStore,
  id: string,
  provider: string,
  eventType: string,
  envelope: StoredCallbackEnvelope = {},
  now = new Date()
): Promise<CallbackClaim> {
  const processingUntil = new Date(now.getTime() + CALLBACK_LEASE_MS);
  try {
    await prisma.callbackEvent.create({
      data: {
        id,
        provider,
        eventType,
        processingUntil,
        attempts: 1,
        status: CallbackEventStatus.PROCESSING,
        ...(envelope.payloadHash ? { payloadHash: envelope.payloadHash } : {}),
        ...(envelope.payloadCiphertext ? { payloadCiphertext: envelope.payloadCiphertext } : {}),
        ...(envelope.payloadSchema ? { payloadSchema: envelope.payloadSchema } : {}),
        ...(envelope.payloadRetainUntil ? { payloadRetainUntil: envelope.payloadRetainUntil } : {})
      }
    });
    return "claimed";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  const existing = await prisma.callbackEvent.findUnique({ where: { id } });
  if (!existing) return "busy";
  if (existing.processedAt || TERMINAL_STATUSES.has(existing.status)) return "processed";
  if (existing.status === CallbackEventStatus.DEAD_LETTER) return "dead_letter";
  const claimed = await prisma.callbackEvent.updateMany({
    where: {
      id,
      processedAt: null,
      status: {
        in: [
          CallbackEventStatus.RECEIVED,
          CallbackEventStatus.PROCESSING,
          CallbackEventStatus.RETRYABLE_FAILURE
        ]
      },
      OR: [{ processingUntil: null }, { processingUntil: { lte: now } }]
    },
    data: {
      processingUntil,
      attempts: { increment: 1 },
      outcome: "RETRYING",
      status: CallbackEventStatus.PROCESSING
    }
  });
  return claimed.count === 1 ? "claimed" : "busy";
}

export async function finishCallbackEvent(
  prisma: CallbackStore,
  id: string,
  outcome: string
): Promise<void> {
  const status =
    outcome === "REJECTED" ? CallbackEventStatus.REJECTED : CallbackEventStatus.PROCESSED;
  await prisma.callbackEvent.update({
    where: { id },
    data: { outcome, processedAt: new Date(), processingUntil: null, status }
  });
}

export async function releaseCallbackEvent(
  prisma: CallbackStore,
  id: string,
  outcome: string
): Promise<void> {
  const existing = await prisma.callbackEvent.findUnique({ where: { id } });
  const deadLetter = (existing?.attempts ?? 0) >= CALLBACK_MAX_ATTEMPTS;
  const status = deadLetter
    ? CallbackEventStatus.DEAD_LETTER
    : CallbackEventStatus.RETRYABLE_FAILURE;
  await prisma.callbackEvent.updateMany({
    where: { id, processedAt: null },
    data: { outcome, processingUntil: null, status }
  });
  if (deadLetter && existing) {
    const circuitKey = await openProviderCircuit(
      prisma as never,
      existing.provider,
      `Callback ${id} entered dead letter`,
      "system:dead-letter"
    );
    await prisma.operationalEvent.create({
      data: {
        eventType: "CALLBACK_DEAD_LETTER",
        actorType: "SYSTEM",
        entityType: "CallbackEvent",
        entityId: id,
        value: existing.attempts,
        metadataJson: {
          provider: existing.provider,
          eventType: existing.eventType,
          circuitKey
        }
      }
    });
  }
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
      status: string;
      attempts: number;
      provider: string;
      eventType: string;
    } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
    update(args: unknown): Promise<unknown>;
  };
  operationalEvent: {
    create(args: unknown): Promise<unknown>;
  };
  circuitBreaker: {
    findUnique(args: unknown): Promise<{ state: string } | null>;
    upsert(args: unknown): Promise<unknown>;
  };
};

type RawBodyRequest = { rawBody?: Buffer; ip?: string; socket?: { remoteAddress?: string | null } };

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
