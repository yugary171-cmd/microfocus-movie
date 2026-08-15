import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  COVER_URL_MAX_LENGTH,
  DEVICE_ID_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  ENTITY_ID_MAX_LENGTH,
  EPISODE_DURATION_SECONDS_MAX,
  HEARTBEAT_SEQ_MAX,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  REWARD_NONCE_MAX_LENGTH,
  SESSION_ID_MAX_LENGTH,
  SIGNATURE_MAX_LENGTH,
  WECHAT_CODE_MAX_LENGTH
} from "@microfocus/contracts";
import { AdminLoginDto, WechatLoginDto } from "./auth/auth.module.js";
import { RewardCallbackDto, VodCallbackDto } from "./callbacks/callbacks.module.js";
import { ProgressDto } from "./history/history.module.js";
import { CreateLeaseDto, HeartbeatDto } from "./playback/playback.module.js";
import { UpdateProfileDto } from "./profile/profile.module.js";
import { CompleteChallengeDto, CreateChallengeDto } from "./rewards/rewards.module.js";

async function propertyError(dto: object, property: string): Promise<boolean> {
  const errors = await validate(dto);
  return errors.some((error) => error.property === property);
}

describe("remaining write input limits", () => {
  it("rejects oversized wechat codes and admin login secrets before hashing", async () => {
    expect(
      await propertyError(
        plainToInstance(WechatLoginDto, { code: "c".repeat(WECHAT_CODE_MAX_LENGTH + 1) }),
        "code"
      )
    ).toBe(true);
    expect(await validate(plainToInstance(WechatLoginDto, { code: "wx-code" }))).toEqual([]);

    const login = {
      email: `${"a".repeat(EMAIL_MAX_LENGTH)}@x.invalid`,
      password: "p".repeat(PASSWORD_MAX_LENGTH + 1),
      otp: "1".repeat(OTP_MAX_LENGTH + 1)
    };
    expect(await propertyError(plainToInstance(AdminLoginDto, login), "email")).toBe(true);
    expect(await propertyError(plainToInstance(AdminLoginDto, login), "password")).toBe(true);
    expect(await propertyError(plainToInstance(AdminLoginDto, login), "otp")).toBe(true);
    expect(
      await propertyError(
        plainToInstance(AdminLoginDto, {
          email: "ops@example.invalid",
          password: "p".repeat(PASSWORD_MIN_LENGTH - 1),
          otp: "123456"
        }),
        "password"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(AdminLoginDto, {
          email: "ops@example.invalid",
          password: "password1",
          otp: "1".repeat(OTP_MIN_LENGTH - 1)
        }),
        "otp"
      )
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(AdminLoginDto, {
          email: "ops@example.invalid",
          password: "password1",
          otp: "123456"
        })
      )
    ).toEqual([]);
  });

  it("rejects oversized playback lease, heartbeat, and progress fields", async () => {
    expect(
      await propertyError(
        plainToInstance(CreateLeaseDto, {
          episodeId: "e".repeat(ENTITY_ID_MAX_LENGTH + 1),
          deviceId: "d".repeat(DEVICE_ID_MAX_LENGTH + 1)
        }),
        "episodeId"
      )
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(CreateLeaseDto, { episodeId: "episode-1", deviceId: "device-1234" })
      )
    ).toEqual([]);

    const heartbeat = {
      seq: HEARTBEAT_SEQ_MAX + 1,
      mediaPositionSeconds: EPISODE_DURATION_SECONDS_MAX + 1,
      previousMediaPositionSeconds: 0,
      playbackRate: 1,
      state: "playing",
      windowId: "w".repeat(ENTITY_ID_MAX_LENGTH + 1)
    };
    expect(await propertyError(plainToInstance(HeartbeatDto, heartbeat), "seq")).toBe(true);
    expect(await propertyError(plainToInstance(HeartbeatDto, heartbeat), "mediaPositionSeconds")).toBe(
      true
    );
    expect(await propertyError(plainToInstance(HeartbeatDto, heartbeat), "windowId")).toBe(true);
    expect(
      await propertyError(
        plainToInstance(HeartbeatDto, { ...heartbeat, seq: 1, mediaPositionSeconds: 12, playbackRate: PLAYBACK_RATE_MAX + 0.25, windowId: "window-1" }),
        "playbackRate"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(HeartbeatDto, { ...heartbeat, seq: 1, mediaPositionSeconds: 12, playbackRate: PLAYBACK_RATE_MIN - 0.25, windowId: "window-1" }),
        "playbackRate"
      )
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(HeartbeatDto, {
          seq: 1,
          mediaPositionSeconds: 12,
          previousMediaPositionSeconds: 7,
          playbackRate: 1,
          state: "playing",
          windowId: "window-1"
        })
      )
    ).toEqual([]);

    expect(
      await propertyError(
        plainToInstance(ProgressDto, {
          dramaId: "drama-1",
          episodeId: "episode-1",
          mediaPositionSeconds: EPISODE_DURATION_SECONDS_MAX + 1
        }),
        "mediaPositionSeconds"
      )
    ).toBe(true);
  });

  it("rejects oversized reward and callback identifiers", async () => {
    expect(
      await propertyError(
        plainToInstance(CreateChallengeDto, {
          dramaId: "d".repeat(ENTITY_ID_MAX_LENGTH + 1),
          sessionId: "s".repeat(SESSION_ID_MAX_LENGTH + 1)
        }),
        "dramaId"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(CompleteChallengeDto, {
          nonce: "n".repeat(REWARD_NONCE_MAX_LENGTH + 1),
          isEnded: true,
          clientCompletedAt: "2026-08-14T12:00:00.000Z"
        }),
        "nonce"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(VodCallbackDto, {
          eventId: "e".repeat(ENTITY_ID_MAX_LENGTH + 1),
          fileId: "file-1",
          mediaStatus: "READY",
          transcodeStatus: "READY",
          machineReviewStatus: "APPROVED"
        }),
        "eventId"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(RewardCallbackDto, {
          eventId: "event-1",
          challengeId: "c".repeat(ENTITY_ID_MAX_LENGTH + 1)
        }),
        "challengeId"
      )
    ).toBe(true);
  });

  it("rejects oversized profile fields", async () => {
    expect(
      await propertyError(
        plainToInstance(UpdateProfileDto, { displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }),
        "displayName"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(UpdateProfileDto, { signature: "s".repeat(SIGNATURE_MAX_LENGTH + 1) }),
        "signature"
      )
    ).toBe(true);
    expect(
      await propertyError(
        plainToInstance(UpdateProfileDto, { avatarUrl: `https://example.com/${"a".repeat(COVER_URL_MAX_LENGTH)}` }),
        "avatarUrl"
      )
    ).toBe(true);
    expect(await validate(plainToInstance(UpdateProfileDto, { displayName: "新昵称", gender: "unset" }))).toEqual([]);
  });
});
