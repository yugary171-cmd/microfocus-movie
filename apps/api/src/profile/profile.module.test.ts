import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES, DISPLAY_NAME_MAX_LENGTH, ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { ProfileController, profileUpdateData } from "./profile.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function rateLimitOk() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

const user = {
  id: "user-1",
  displayName: "内部体验用户",
  avatarUrl: null,
  signature: "",
  gender: "unset"
};

describe("profile routes", () => {
  it("binds GET and PATCH /v1/me/profile", () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController.prototype.getProfile)).toBe(
      API_ROUTES.profile.replace(/^\//, "")
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProfileController.prototype.getProfile)).toBe(
      RequestMethod.GET
    );
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController.prototype.updateProfile)).toBe(
      API_ROUTES.profile.replace(/^\//, "")
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ProfileController.prototype.updateProfile)).toBe(
      RequestMethod.PATCH
    );
  });

  it("returns the authenticated user's profile", async () => {
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn() }
    };
    const controller = new ProfileController(prisma as never);
    await expect(controller.getProfile({ kind: "user", sub: "user-1" } as never)).resolves.toEqual({
      id: "user-1",
      displayName: "内部体验用户",
      avatarUrl: null,
      signature: "",
      gender: "unset"
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects viewer tokens before reading the profile", async () => {
    const prisma = { rateLimitBucket: rateLimitOk(), user: { findUnique: vi.fn() } };
    const controller = new ProfileController(prisma as never);
    await expect(controller.getProfile({ kind: "viewer", sub: "viewer-1" } as never)).rejects.toMatchObject({
      code: ERROR_CODES.USER_TOKEN_REQUIRED
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rate-limits profile reads and writes by authenticated user", async () => {
    expect(RATE_LIMITS.profileRead).toEqual({ limit: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.profileWrite).toEqual({ limit: 20, windowMs: 60_000 });
    const prisma = {
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      },
      user: { findUnique: vi.fn(), update: vi.fn() }
    };
    const controller = new ProfileController(prisma as never);
    await expect(controller.getProfile({ kind: "user", sub: "user-1" } as never)).rejects.toMatchObject({
      code: ERROR_CODES.RATE_LIMITED
    });
    await expect(
      controller.updateProfile({ kind: "user", sub: "user-1" } as never, { displayName: "新昵称" })
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: rateLimitBucketId("profileRead", "user:user-1") })
      })
    );
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: rateLimitBucketId("profileWrite", "user:user-1") })
      })
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("patches nickname, signature, gender, and avatar without changing the user id", async () => {
    const prisma = {
      rateLimitBucket: rateLimitOk(),
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue({
          ...user,
          displayName: "新昵称",
          signature: "介绍一下自己",
          gender: "female",
          avatarUrl: "https://example.com/a.png"
        })
      }
    };
    const controller = new ProfileController(prisma as never);
    await expect(
      controller.updateProfile({ kind: "user", sub: "user-1" } as never, {
        displayName: "新昵称",
        signature: "介绍一下自己",
        gender: "female",
        avatarUrl: "https://example.com/a.png"
      })
    ).resolves.toMatchObject({
      id: "user-1",
      displayName: "新昵称",
      signature: "介绍一下自己",
      gender: "female",
      avatarUrl: "https://example.com/a.png"
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        displayName: "新昵称",
        signature: "介绍一下自己",
        gender: "female",
        avatarUrl: "https://example.com/a.png"
      }
    });
  });

  it("rejects an empty patch and overlong nicknames before writing", () => {
    expect(profileUpdateData({})).toBeNull();
    expect(profileUpdateData({ displayName: "  新昵称  " })).toEqual({ displayName: "新昵称" });
    expect("x".repeat(DISPLAY_NAME_MAX_LENGTH + 1).length).toBeGreaterThan(DISPLAY_NAME_MAX_LENGTH);
  });
});
