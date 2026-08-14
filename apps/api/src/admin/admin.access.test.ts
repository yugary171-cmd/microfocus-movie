import { AdminRole } from "@microfocus/contracts";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../common/app-error.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import {
  assertEditorOwns,
  assertNotPublished,
  assertNotSelfReview,
  editorScope
} from "./admin.access.js";
import {
  compensationMatches,
  createIdempotentCompensation,
  normalizeIdempotencyKey
} from "./admin.compensate.js";

const editor = { kind: "admin" as const, sub: "editor-1", role: AdminRole.EDITOR };
const reviewer = { kind: "admin" as const, sub: "reviewer-1", role: AdminRole.REVIEWER };
const admin = { kind: "admin" as const, sub: "admin-1", role: AdminRole.ADMIN };

describe("admin access", () => {
  it("scopes lists to the editor and leaves reviewer/admin unscoped", () => {
    expect(editorScope(editor)).toEqual({ editorId: "editor-1" });
    expect(editorScope(reviewer)).toEqual({});
    expect(editorScope(admin)).toEqual({});
  });

  it("blocks editors from other editors' dramas", () => {
    expect(() => assertEditorOwns({ editorId: "editor-2" }, editor)).toThrow(AppError);
    try {
      assertEditorOwns({ editorId: "editor-2" }, editor);
    } catch (error) {
      expect(error).toMatchObject({ code: "OWNERSHIP_REQUIRED" });
    }
    expect(assertEditorOwns({ editorId: "editor-1" }, editor).editorId).toBe("editor-1");
    expect(assertEditorOwns({ editorId: "editor-1" }, reviewer).editorId).toBe("editor-1");
  });

  it("forbids self-review and published mutation", () => {
    expect(() => assertNotSelfReview("reviewer-1", "reviewer-1")).toThrow(AppError);
    expect(() => assertNotPublished("PUBLISHED")).toThrow(AppError);
    expect(() => assertNotPublished("DRAFT")).not.toThrow();
  });
});

describe("compensation idempotency", () => {
  const payload = {
    compensationKey: "comp-1",
    userId: "user-1",
    dramaId: "drama-1",
    seconds: 600,
    expiresAt: new Date("2026-08-15T00:00:00.000Z"),
    reason: "事故补偿"
  };
  const grant = {
    id: "grant-1",
    source: "COMPENSATION",
    userId: payload.userId,
    dramaId: payload.dramaId,
    grantedSeconds: payload.seconds,
    remainingSeconds: 120,
    note: payload.reason,
    compensationKey: payload.compensationKey
  };

  it("requires a bounded Idempotency-Key", () => {
    expect(() => normalizeIdempotencyKey(undefined)).toThrow(AppError);
    expect(() => normalizeIdempotencyKey("x".repeat(129))).toThrow(AppError);
    expect(normalizeIdempotencyKey("  comp-1  ")).toBe("comp-1");
  });

  it("treats remaining-seconds changes as the same compensation payload", () => {
    expect(compensationMatches(grant, payload)).toBe(true);
    expect(compensationMatches({ ...grant, userId: "other" }, payload)).toBe(false);
  });

  it("returns the original grant on replay and does not create a second row", async () => {
    const prisma = {
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        create: vi.fn()
      }
    };
    const result = await createIdempotentCompensation(
      prisma as unknown as PrismaService,
      payload
    );
    expect(result).toEqual({ grant, replayed: true });
    expect(prisma.entitlementGrant.create).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different payload", async () => {
    const prisma = {
      entitlementGrant: {
        findUnique: vi.fn().mockResolvedValue(grant),
        create: vi.fn()
      }
    };
    await expect(
      createIdempotentCompensation(prisma as unknown as PrismaService, {
        ...payload,
        seconds: 1200
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE" });
  });

  it("recovers a concurrent unique-key collision as a replay", async () => {
    const prisma = {
      entitlementGrant: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(grant),
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test"
          })
        )
      }
    };
    const result = await createIdempotentCompensation(
      prisma as unknown as PrismaService,
      payload
    );
    expect(result).toEqual({ grant, replayed: true });
  });
});
