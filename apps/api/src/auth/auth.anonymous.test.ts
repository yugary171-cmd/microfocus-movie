import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@microfocus/contracts";
import { AuthController } from "./auth.module.js";
import { RATE_LIMITS, rateLimitBucketId } from "../security/rate-limit.js";

function allowRateLimit() {
  return {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn()
  };
}

function request(ip = "10.0.0.8") {
  return { socket: { remoteAddress: ip } };
}

describe("anonymous viewer sessions", () => {
  it("issues a viewer token bound to device and session", async () => {
    const prisma = {
      anonymousViewerSession: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "viewer-1" })
      },
      rateLimitBucket: allowRateLimit()
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("viewer-jwt") };
    const controller = new AuthController(
      prisma as never,
      jwt as never,
      {} as never,
      {} as never
    );

    const result = await controller.anonymousSession(request(), {
      deviceId: "device-1234",
      sessionId: "session-1234"
    });

    expect(result).toEqual({
      accessToken: "viewer-jwt",
      tokenKind: "viewer",
      expiresAt: expect.any(String)
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: "viewer-1", kind: "viewer", deviceId: "device-1234" },
      expect.objectContaining({ expiresIn: expect.any(Number) })
    );
    expect(prisma.rateLimitBucket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rateLimitBucketId("anonymousSession", "10.0.0.8")
        })
      })
    );
  });

  it("rate limits new anonymous sessions by connection IP, not deviceId", async () => {
    expect(RATE_LIMITS.anonymousSession).toEqual({ limit: 10, windowMs: 10 * 60_000 });
    const prisma = {
      anonymousViewerSession: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn(),
        upsert: vi.fn()
      },
      rateLimitBucket: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({ windowStart: new Date(), count: 99 }),
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    const controller = new AuthController(
      prisma as never,
      { signAsync: vi.fn() } as never,
      {} as never,
      {} as never
    );

    await expect(
      controller.anonymousSession(request(), {
        deviceId: "device-1234",
        sessionId: "session-9999"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.anonymousViewerSession.count).not.toHaveBeenCalled();
    expect(prisma.anonymousViewerSession.upsert).not.toHaveBeenCalled();
  });

  it("does not consume the new-session bucket when refreshing an existing viewer", async () => {
    const prisma = {
      anonymousViewerSession: {
        findUnique: vi.fn().mockResolvedValue({ id: "viewer-1" }),
        upsert: vi.fn().mockResolvedValue({ id: "viewer-1" })
      },
      rateLimitBucket: allowRateLimit()
    };
    const controller = new AuthController(
      prisma as never,
      { signAsync: vi.fn().mockResolvedValue("viewer-jwt") } as never,
      {} as never,
      {} as never
    );

    await expect(
      controller.anonymousSession(request(), {
        deviceId: "device-1234",
        sessionId: "session-1234"
      })
    ).resolves.toMatchObject({ tokenKind: "viewer" });
    expect(prisma.rateLimitBucket.updateMany).not.toHaveBeenCalled();
  });
});

describe("anonymous error contract", () => {
  it("exports a stable expired-session code", () => {
    expect(ERROR_CODES.ANONYMOUS_SESSION_EXPIRED).toBe("ANONYMOUS_SESSION_EXPIRED");
  });
});
