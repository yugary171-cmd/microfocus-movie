import { AdminRole } from "@prisma/client";
import { compare } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { tryDecryptTotpSecret } from "../security/totp-crypto.js";
import {
  ADMIN_BREAK_GLASS_ACTION,
  ADMIN_BREAK_GLASS_CONFIRMATION,
  applyAdminBreakGlass,
  parseBreakGlassCommand,
  prepareBreakGlass
} from "./admin-break-glass.js";

const encryptionKey = "break-glass-totp-key-material-32ch";
const validEnv = {
  ADMIN_BREAK_GLASS_CONFIRM: ADMIN_BREAK_GLASS_CONFIRMATION,
  ADMIN_BREAK_GLASS_EMAIL: "Ops@Example.invalid",
  ADMIN_BREAK_GLASS_PASSWORD: "a-strong-recovery-password",
  ADMIN_BREAK_GLASS_REASON: "all administrators lost authenticators",
  TOTP_ENCRYPTION_KEY: encryptionKey,
  NODE_ENV: "test"
};

describe("administrator break-glass recovery", () => {
  it("requires the public confirmation phrase and an existing admin email", () => {
    expect(() => parseBreakGlassCommand({ ...validEnv, ADMIN_BREAK_GLASS_CONFIRM: "yes" }, [])).toThrow(
      /ADMIN_BREAK_GLASS_CONFIRM/
    );
    expect(() =>
      parseBreakGlassCommand({ ...validEnv, ADMIN_BREAK_GLASS_EMAIL: "not-an-email" }, [])
    ).toThrow(/ADMIN_BREAK_GLASS_EMAIL/);
    const parsed = parseBreakGlassCommand(validEnv, ["--commit"]);
    expect(parsed.commit).toBe(true);
    expect(parsed.email).toBe("ops@example.invalid");
  });

  it("refuses example passwords in production", () => {
    expect(() =>
      parseBreakGlassCommand(
        {
          ...validEnv,
          NODE_ENV: "production",
          ADMIN_BREAK_GLASS_PASSWORD: "replace-with-a-strong-password"
        },
        []
      )
    ).toThrow(/example administrator password/);
  });

  it("dry-run locates the ADMIN without writing credentials", async () => {
    const update = vi.fn();
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "admin-1",
          email: "ops@example.invalid",
          role: AdminRole.ADMIN,
          sessionVersion: 2
        }),
        update
      },
      adminSetupToken: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      operationalEvent: { create: vi.fn() }
    };
    const prepared = await prepareBreakGlass(parseBreakGlassCommand(validEnv, []));
    const summary = await applyAdminBreakGlass(tx, prepared);
    expect(summary).toEqual({
      mode: "dry-run",
      adminId: "admin-1",
      email: "ops@example.invalid"
    });
    expect(update).not.toHaveBeenCalled();
    expect(prepared.passwordHash).not.toContain("a-strong-recovery-password");
    await expect(compare("a-strong-recovery-password", prepared.passwordHash)).resolves.toBe(true);
  });

  it("commits a hashed password, encrypted TOTP, session bump, and audit facts", async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "admin-1",
          email: "ops@example.invalid",
          role: AdminRole.ADMIN,
          sessionVersion: 2
        }),
        update: vi.fn().mockResolvedValue({ id: "admin-1", sessionVersion: 3 })
      },
      adminSetupToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      operationalEvent: { create: vi.fn().mockResolvedValue({}) }
    };
    const prepared = await prepareBreakGlass(parseBreakGlassCommand(validEnv, ["--commit"]));
    const summary = await applyAdminBreakGlass(tx, prepared);
    expect(summary.mode).toBe("apply");
    expect(summary.sessionVersion).toBe(3);
    expect(summary.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(summary.manualKey).toMatch(/^[A-Z2-7]+$/);
    expect(tryDecryptTotpSecret(prepared.totpSecretEncrypted, { current: encryptionKey })?.secret).toBe(
      prepared.manualKey
    );
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpEnabled: true,
          active: true,
          passwordHash: prepared.passwordHash,
          sessionVersion: { increment: 1 }
        })
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: ADMIN_BREAK_GLASS_ACTION,
          metadataJson: expect.objectContaining({ actor: "ops-cli" })
        })
      })
    );
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("a-strong-recovery-password");
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(prepared.manualKey);
  });

  it("refuses to recover a non-ADMIN account", async () => {
    const tx = {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "editor-1",
          email: "ops@example.invalid",
          role: AdminRole.EDITOR,
          sessionVersion: 1
        }),
        update: vi.fn()
      },
      adminSetupToken: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
      operationalEvent: { create: vi.fn() }
    };
    const prepared = await prepareBreakGlass(parseBreakGlassCommand(validEnv, ["--commit"]));
    await expect(applyAdminBreakGlass(tx, prepared)).rejects.toThrow(/limited to existing ADMIN/);
  });
});
