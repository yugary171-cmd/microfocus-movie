import { AdminRole, DramaStatus } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { canReview, canSubmitReview, isRightsActive, publishDecision } from "./admin";
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

  it("allows content operators to publish when the mock internal gate is waived", () => {
    const decision = publishDecision(
      createUser(AdminRole.REVIEWER),
      createDrama(),
      createGate({ readyForExternalTraffic: false, blockers: ["Provider 尚未配置"] }),
      { allowMockInternal: true },
    );

    expect(decision).toEqual({ allowed: true, reason: "" });
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

  it("lets an editor review their own pending item and publish a ready drama", () => {
    const editor = createUser(AdminRole.EDITOR);
    expect(
      canReview(editor, {
        id: "review-1",
        dramaId: "drama-test",
        dramaTitle: "测试剧目",
        submitterId: editor.id,
        submitterName: editor.name,
        submittedAt: "2026-08-14T00:00:00.000Z",
        riskFlags: [],
        status: "PENDING",
      }),
    ).toEqual({ allowed: true, reason: "" });
    expect(publishDecision(editor, createDrama({ ownerId: editor.id }), createGate())).toEqual({
      allowed: true,
      reason: "",
    });
    expect(canSubmitReview(editor, createDrama({ status: DramaStatus.DRAFT, ownerId: editor.id })).allowed).toBe(
      true,
    );
  });

  it("blocks an editor from reviewing another editor's pending item but lets ADMIN review it", () => {
    const item = {
      id: "review-2",
      dramaId: "drama-other",
      dramaTitle: "他人剧目",
      submitterId: "editor-2",
      submitterName: "另一位编辑",
      submittedAt: "2026-08-14T00:00:00.000Z",
      riskFlags: [],
      status: "PENDING" as const,
    };
    expect(canReview(createUser(AdminRole.EDITOR), item)).toEqual({
      allowed: false,
      reason: "只能审核本人负责的剧目",
    });
    expect(canReview(createUser(AdminRole.REVIEWER), item)).toEqual({
      allowed: false,
      reason: "只能审核本人负责的剧目",
    });
    expect(canReview(createUser(AdminRole.ADMIN), item)).toEqual({ allowed: true, reason: "" });
  });
});
