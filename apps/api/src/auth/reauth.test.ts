import { ERROR_CODES } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { assertRecentWechatReauth } from "./reauth.js";

const userId = "user-1";
const openId = "wx-open-id";

function prismaWithUser(user: { openId: string; status: string } | null) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) }
  };
}

describe("recent WeChat reauthentication", () => {
  it("requires a non-empty wechat code", async () => {
    await expect(
      assertRecentWechatReauth({
        prisma: prismaWithUser({ openId, status: "ACTIVE" }) as never,
        wechat: { exchangeCode: vi.fn() },
        wechatMode: "live",
        userId,
        wechatCode: "   "
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.REAUTH_REQUIRED });
  });

  it("accepts a live code that resolves to the same openId", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ openId });
    await assertRecentWechatReauth({
      prisma: prismaWithUser({ openId, status: "ACTIVE" }) as never,
      wechat: { exchangeCode },
      wechatMode: "live",
      userId,
      wechatCode: "fresh-login-code"
    });
    expect(exchangeCode).toHaveBeenCalledWith("fresh-login-code");
  });

  it("rejects a live code bound to a different WeChat identity", async () => {
    await expect(
      assertRecentWechatReauth({
        prisma: prismaWithUser({ openId, status: "ACTIVE" }) as never,
        wechat: { exchangeCode: vi.fn().mockResolvedValue({ openId: "other-open-id" }) },
        wechatMode: "live",
        userId,
        wechatCode: "fresh-login-code"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.REAUTH_MISMATCH });
  });

  it("accepts a successful mock exchange without requiring the hashed openId to match", async () => {
    await assertRecentWechatReauth({
      prisma: prismaWithUser({ openId: "mock:abc", status: "ACTIVE" }) as never,
      wechat: { exchangeCode: vi.fn().mockResolvedValue({ openId: "mock:def" }) },
      wechatMode: "mock",
      userId,
      wechatCode: "another-wx-code"
    });
  });

  it("does not apply the mock ceremony shortcut in live mode", async () => {
    await expect(
      assertRecentWechatReauth({
        prisma: prismaWithUser({ openId: "mock:abc", status: "ACTIVE" }) as never,
        wechat: { exchangeCode: vi.fn().mockResolvedValue({ openId: "mock:def" }) },
        wechatMode: "live",
        userId,
        wechatCode: "another-wx-code"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.REAUTH_MISMATCH });
  });
});
