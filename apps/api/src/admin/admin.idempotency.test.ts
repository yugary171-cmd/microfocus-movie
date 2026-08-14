import { AdminRole, EntitlementAdjustmentType, IDEMPOTENCY_KEY_MAX_LENGTH } from "@microfocus/contracts";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.module.js";

const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };

function controller(prisma: object) {
  return new AdminController(
    prisma as never,
    { env: {} } as never,
    {} as never,
    { verifyReward: vi.fn() } as never
  );
}

describe("admin idempotency keys at handler entry", () => {
  it("rejects blank or oversized keys before adjustment, replay, or token reissue lookups", async () => {
    const prisma = {
      entitlementAdjustment: { findUnique: vi.fn() },
      callbackReplay: { findUnique: vi.fn() },
      deletionQueryTokenReissue: { findUnique: vi.fn() }
    };
    const api = controller(prisma);
    const oversized = "x".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1);
    const adjustBody = {
      type: EntitlementAdjustmentType.FREEZE_REMAINDER,
      grantId: "grant-1",
      seconds: 60,
      reason: "错误发放冻结"
    };
    const replayBody = { reason: "修复验签时钟后重放" };
    const reissueBody = {
      userId: "user-1",
      reason: "用户遗失查询令牌",
      approvalNote: "工单 CS-1 已核验微焦号"
    };

    for (const key of [undefined, "   ", oversized] as const) {
      await expect(api.adjust(admin as never, key, adjustBody)).rejects.toMatchObject({
        code: "IDEMPOTENCY_KEY_REQUIRED"
      });
      await expect(
        api.replayCallback(admin as never, "event-1", key, replayBody)
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      await expect(
        api.reissueDeletionQueryToken(admin as never, "del-1", key, reissueBody)
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    }

    expect(prisma.entitlementAdjustment.findUnique).not.toHaveBeenCalled();
    expect(prisma.callbackReplay.findUnique).not.toHaveBeenCalled();
    expect(prisma.deletionQueryTokenReissue.findUnique).not.toHaveBeenCalled();
  });
});
