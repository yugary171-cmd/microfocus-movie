import { AdminRole } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { publishDecision } from "./admin";
import { createDrama, createGate, createUser } from "@/test/fixtures";

describe("publishDecision", () => {
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
});
