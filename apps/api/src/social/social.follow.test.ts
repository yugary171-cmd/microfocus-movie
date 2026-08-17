import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES, ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { controllerPath } from "../common/http.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";
import { FollowController } from "./social.module.js";
import { MessagesController } from "./messages.controller.js";

function rateLimitOk() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

const activeUser = {
  id: "user-2",
  displayName: "对方",
  avatarUrl: null,
  signature: "",
  gender: "unset",
  status: "ACTIVE",
  followerCount: 1,
  followingCount: 0,
  receivedCommentLikeCount: 0
};

describe("social follow routes", () => {
  it("binds public profile and follow write paths to API_ROUTES", () => {
    expect(Reflect.getMetadata(PATH_METADATA, FollowController.prototype.getUser)).toBe(
      controllerPath(API_ROUTES.user(":userId"))
    );
    expect(Reflect.getMetadata(METHOD_METADATA, FollowController.prototype.follow)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, FollowController.prototype.unfollow)).toBe(
      RequestMethod.DELETE
    );
  });

  it("rejects following yourself", async () => {
    const prisma = { rateLimitBucket: rateLimitOk(), user: { findUnique: vi.fn() } };
    const controller = new FollowController(prisma as never);
    await expect(
      controller.follow({ kind: "user", sub: "user-1" } as never, "user-1")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rate-limits public profile reads", async () => {
    expect(RATE_LIMITS.socialRead).toEqual({ limit: 60, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      user: { findUnique: vi.fn() }
    };
    const controller = new FollowController(prisma as never);
    await expect(
      controller.getUser({ socket: { remoteAddress: "10.0.0.8" } }, "user-2")
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("socialRead", "10.0.0.8")
        })
      })
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns followedByMe for an authenticated viewer", async () => {
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      user: { findUnique: vi.fn().mockResolvedValue(activeUser) },
      userFollow: { findMany: vi.fn().mockResolvedValue([{ followeeId: "user-2" }]) }
    };
    const controller = new FollowController(prisma as never);
    await expect(
      controller.getUser({ socket: { remoteAddress: "10.0.0.8" } }, "user-2", {
        kind: "user",
        sub: "user-1"
      } as never)
    ).resolves.toMatchObject({
      id: "user-2",
      followerCount: 1,
      followedByMe: true
    });
  });
});

describe("direct messages require follow", () => {
  it("rejects creating a conversation without a follow edge", async () => {
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      user: { findUnique: vi.fn().mockResolvedValue(activeUser) },
      userFollow: { findUnique: vi.fn().mockResolvedValue(null) },
      directConversation: { upsert: vi.fn() }
    };
    const controller = new MessagesController(prisma as never);
    await expect(
      controller.createConversation({ kind: "user", sub: "user-1" } as never, {
        peerUserId: "user-2"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.FOLLOW_REQUIRED });
    expect(prisma.directConversation.upsert).not.toHaveBeenCalled();
  });
});
