import { AdminRole } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { isRightsActive, publishDecision } from "./admin";
import { createDrama, createGate, createUser } from "@/test/fixtures";

describe("publishDecision", () => {
  it("treats date-only license expiry as valid through that calendar day", () => {
    expect(isRightsActive("2026-01-01", "2026-12-31", Date.parse("2026-12-31T12:00:00.000Z"))).toBe(true);
    expect(isRightsActive("2027-01-01", "2027-12-31", Date.parse("2026-12-31T12:00:00.000Z"))).toBe(false);
  });

  it("blocks publishing when rights are expired", () => {
    const decision = publishDecision(
      createUser(AdminRole.ADMIN),
      createDrama({ licenseExpiresAt: "2026-01-01" }),
      createGate(),
    );

    expect(decision).toEqual({ allowed: false, reason: "版权许可当前不在有效期内" });
  });

  it("blocks publishing when the external release gate has not passed", () => {
    const decision = publishDecision(
      createUser(AdminRole.ADMIN),
      createDrama(),
      createGate({
        readyForExternalTraffic: false,
        blockers: ["微信类目尚未通过"],
      }),
    );

    expect(decision).toEqual({
      allowed: false,
      reason: "合规发布闸门尚未通过",
    });
  });

  it("does not expose publishing authority to reviewers", () => {
    const decision = publishDecision(
      createUser(AdminRole.REVIEWER),
      createDrama(),
      createGate(),
    );

    expect(decision).toEqual({ allowed: false, reason: "仅系统管理员可以发布" });
  });

  it("allows an internal Mock publish while keeping the external gate closed", () => {
    const decision = publishDecision(
      createUser(AdminRole.ADMIN),
      createDrama(),
      createGate({ readyForExternalTraffic: false, blockers: ["Provider 尚未配置"] }),
      { allowMockInternal: true },
    );

    expect(decision).toEqual({ allowed: true, reason: "" });
  });
});
