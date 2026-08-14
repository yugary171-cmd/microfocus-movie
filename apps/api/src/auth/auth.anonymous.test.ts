import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@microfocus/contracts";
import { AuthController } from "./auth.module.js";

describe("anonymous viewer sessions", () => {
  it("issues a viewer token bound to device and session", async () => {
    const prisma = {
      anonymousViewerSession: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({ id: "viewer-1" })
      }
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue("viewer-jwt") };
    const controller = new AuthController(
      prisma as never,
      jwt as never,
      {} as never,
      {} as never
    );

    const result = await controller.anonymousSession({
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
  });

  it("rate limits new anonymous sessions per device", async () => {
    const prisma = {
      anonymousViewerSession: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(10),
        upsert: vi.fn()
      }
    };
    const controller = new AuthController(
      prisma as never,
      { signAsync: vi.fn() } as never,
      {} as never,
      {} as never
    );

    await expect(
      controller.anonymousSession({
        deviceId: "device-1234",
        sessionId: "session-9999"
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(prisma.anonymousViewerSession.upsert).not.toHaveBeenCalled();
  });
});

describe("anonymous error contract", () => {
  it("exports a stable expired-session code", () => {
    expect(ERROR_CODES.ANONYMOUS_SESSION_EXPIRED).toBe("ANONYMOUS_SESSION_EXPIRED");
  });
});
