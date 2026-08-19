import {
  ADMIN_LIST_PAGE_SIZE,
  ERROR_CODES,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose
} from "@microfocus/contracts";
import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AdminAccountsService } from "./admin-accounts.service.js";
import { AdminSetupService } from "./admin-setup.service.js";

const createdAt = new Date("2026-08-18T00:00:00.000Z");
const setupCompletedAt = new Date("2026-08-18T01:00:00.000Z");

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "target-1",
    email: "target@example.com",
    displayName: "目标账号",
    passwordHash: "password-hash",
    role: AdminRole.REVIEWER,
    active: true,
    setupCompletedAt,
    sessionVersion: 1,
    lastLoginAt: null,
    totpEnabled: true,
    totpSecretEncrypted: "operator-secret",
    createdAt,
    updatedAt: createdAt,
    _count: { editedDramas: 0 },
    ...overrides
  };
}

function operator(role: AdminRole = AdminRole.ADMIN) {
  return {
    role,
    active: true,
    setupCompletedAt,
    totpEnabled: true,
    totpSecretEncrypted: "operator-secret"
  };
}

function totp(overrides: Record<string, unknown> = {}) {
  return {
    createSetupSecret: vi.fn().mockReturnValue({
      encryptedSecret: "encrypted-setup-secret",
      manualKey: "ABCDEFGHIJKLMNOPQRSTUVWX23456789",
      otpauthUri: "otpauth://secret"
    }),
    verifyAdminOtp: vi.fn().mockReturnValue(true),
    verifySetupOtp: vi.fn().mockReturnValue(true),
    revealSetupSecret: vi.fn().mockReturnValue({
      manualKey: "ABCDEFGHIJKLMNOPQRSTUVWX23456789",
      otpauthUri: "otpauth://visible-only-to-inspect"
    }),
    ...overrides
  };
}

function service(prisma: object, totpService = totp()): AdminAccountsService {
  const setup = setupService(prisma, totpService);
  return new AdminAccountsService(
    prisma as never,
    totpService as never,
    setup
  );
}

function setupService(prisma: object, totpService = totp()): AdminSetupService {
  return new AdminSetupService(
    prisma as never,
    { env: { ADMIN_ORIGIN: "https://admin.example.com" } } as never,
    totpService as never
  );
}

function transactionPrisma(tx: object, outside: Record<string, unknown> = {}) {
  return {
    ...outside,
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(tx);
      return Promise.all(input as Promise<unknown>[]);
    })
  };
}

describe("administrator account listing and creation", () => {
  it("filters and paginates accounts with derived status", async () => {
    const rows = [account({ setupCompletedAt: null, active: false })];
    const prisma = {
      adminUser: {
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn().mockResolvedValue(1)
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))
    };
    const result = await service(prisma).list({
      query: " target ",
      role: AdminRole.REVIEWER,
      status: AdminAccountStatus.PENDING_SETUP,
      page: "1"
    });
    expect(result).toMatchObject({
      page: 1,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      total: 1,
      items: [
        {
          status: AdminAccountStatus.PENDING_SETUP,
          totpEnabled: true,
          ownedDramaCount: 0,
          updatedAt: createdAt.toISOString()
        }
      ]
    });
    expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: AdminRole.REVIEWER,
          setupCompletedAt: null,
          OR: [
            { email: { contains: "target" } },
            { displayName: { contains: "target" } }
          ]
        },
        take: ADMIN_LIST_PAGE_SIZE
      })
    );
  });

  it("stores only setup token and TOTP ciphertext while returning the raw token once", async () => {
    const setupToken = {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "setup-1" })
    };
    const auditLog = { create: vi.fn().mockResolvedValue({ id: "audit-1" }) };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id?: string; email?: string } }) =>
          args.where.id === "operator-1" ? operator() : null
        ),
        create: vi.fn().mockResolvedValue(
          account({
            id: "new-admin",
            email: "new@example.com",
            displayName: "新管理员",
            role: AdminRole.EDITOR,
            passwordHash: null,
            setupCompletedAt: null,
            totpEnabled: false,
            totpSecretEncrypted: null
          })
        )
      },
      adminSetupToken: setupToken,
      auditLog
    };
    const api = service(transactionPrisma(tx));
    const result = await api.create("operator-1", {
      email: " NEW@example.com ",
      displayName: " 新管理员 ",
      role: AdminRole.EDITOR,
      otp: "654321"
    });

    expect(result.setupToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.setupUrl).toBe(
      `https://admin.example.com/account-setup#token=${result.setupToken}`
    );
    const tokenData = setupToken.create.mock.calls[0]?.[0].data;
    expect(tokenData.tokenDigest).toBe(
      createHash("sha256").update(result.setupToken).digest("hex")
    );
    expect(tokenData.totpSecretEncrypted).toBe("encrypted-setup-secret");
    const persisted = JSON.stringify({ tokenData, audit: auditLog.create.mock.calls });
    expect(persisted).not.toContain(result.setupToken);
    expect(persisted).not.toContain("654321");
    expect(persisted).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWX23456789");
  });

  it("checks ADMIN role again inside the sensitive transaction", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      adminUser: {
        findUnique: vi.fn().mockResolvedValue(operator(AdminRole.EDITOR)),
        create: vi.fn()
      }
    };
    await expect(
      service(transactionPrisma(tx)).create("editor-1", {
        email: "new@example.com",
        displayName: "新账号",
        role: AdminRole.EDITOR,
        otp: "123456"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    expect(tx.adminUser.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid sensitive-operation OTP before creating an account", async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn().mockResolvedValue(operator()),
        create: vi.fn()
      }
    };
    await expect(
      service(transactionPrisma(tx), totp({ verifyAdminOtp: vi.fn().mockReturnValue(false) }))
        .create("operator-1", {
          email: "new@example.com",
          displayName: "新账号",
          role: AdminRole.EDITOR,
          otp: "000000"
        })
    ).rejects.toMatchObject({ code: ERROR_CODES.ADMIN_OTP_INVALID });
    expect(tx.adminUser.create).not.toHaveBeenCalled();
  });
});

describe("administrator account mutation safety", () => {
  it("forbids account managers from changing their own role before a transaction starts", async () => {
    const prisma = { $transaction: vi.fn() };
    await expect(
      service(prisma).update("admin-1", "admin-1", {
        role: AdminRole.EDITOR,
        otp: "123456"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.ADMIN_SELF_ACTION_FORBIDDEN });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows an administrator to update only their own display name", async () => {
    const target = account({ id: "admin-1", role: AdminRole.ADMIN });
    const updated = { ...target, displayName: "新姓名" };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "admin-1" }]),
      adminUser: {
        findUnique: vi.fn().mockResolvedValue(target),
        update: vi.fn().mockResolvedValue(updated)
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
    };
    await expect(
      service(transactionPrisma(tx)).update("admin-1", "admin-1", {
        displayName: " 新姓名 ",
        otp: "123456"
      })
    ).resolves.toMatchObject({ displayName: "新姓名", role: AdminRole.ADMIN });
  });

  it("edits display name and role while invalidating the target's old JWT", async () => {
    const target = account({ id: "reviewer-1", role: AdminRole.REVIEWER });
    const updated = { ...target, displayName: "新姓名", role: AdminRole.ADMIN };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn().mockResolvedValue(updated)
      },
      drama: { count: vi.fn().mockResolvedValue(0) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
    };
    const result = await service(transactionPrisma(tx)).update(
      "operator-1",
      "reviewer-1",
      { displayName: " 新姓名 ", role: AdminRole.ADMIN, otp: "123456" }
    );
    expect(result).toMatchObject({ displayName: "新姓名", role: AdminRole.ADMIN });
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          displayName: "新姓名",
          role: AdminRole.ADMIN,
          sessionVersion: { increment: 1 }
        }
      })
    );
  });

  it("reactivates a suspended account and advances its session version", async () => {
    const target = account({ id: "reviewer-1", active: false });
    const activated = { ...target, active: true, sessionVersion: 2 };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn().mockResolvedValue(activated)
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
    };
    const result = await service(transactionPrisma(tx)).activate(
      "operator-1",
      "reviewer-1",
      "123456",
      "账号重新启用用于审核"
    );
    expect(result.status).toBe(AdminAccountStatus.ACTIVE);
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { active: true, sessionVersion: { increment: 1 } }
      })
    );
  });

  it("does not activate an account before setup is complete", async () => {
    const target = account({ id: "reviewer-1", active: false, setupCompletedAt: null });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn()
      },
      auditLog: { create: vi.fn() }
    };
    await expect(
      service(transactionPrisma(tx)).activate(
        "operator-1",
        "reviewer-1",
        "123456",
        "账号重新启用用于审核"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.ADMIN_ACCOUNT_PENDING_SETUP });
    expect(tx.adminUser.update).not.toHaveBeenCalled();
  });

  it("protects the last healthy ADMIN under the serialized account transaction", async () => {
    const target = account({ id: "admin-last", role: AdminRole.ADMIN });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "admin-last" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn()
      },
      auditLog: { create: vi.fn() }
    };
    await expect(
      service(transactionPrisma(tx)).suspend(
        "operator-1",
        "admin-last",
        "123456",
        "管理员离职停用账号"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.LAST_ACTIVE_ADMIN });
    expect(tx.adminUser.update).not.toHaveBeenCalled();
  });

  it("requires and validates a replacement before suspending an EDITOR with dramas", async () => {
    const target = account({ id: "editor-1", role: AdminRole.EDITOR });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn()
      },
      drama: {
        count: vi.fn().mockResolvedValue(2),
        updateMany: vi.fn()
      },
      auditLog: { create: vi.fn() }
    };
    await expect(
      service(transactionPrisma(tx)).suspend(
        "operator-1",
        "editor-1",
        "123456",
        "编辑离职需要移交剧目"
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.EDITOR_TRANSFER_REQUIRED });
    expect(tx.drama.updateMany).not.toHaveBeenCalled();
  });

  it("transfers dramas in the same transaction as the EDITOR status change", async () => {
    const target = account({ id: "editor-1", role: AdminRole.EDITOR });
    const replacement = {
      role: AdminRole.EDITOR,
      active: true,
      setupCompletedAt
    };
    const suspended = { ...target, active: false };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id: string } }) => {
          if (args.where.id === "operator-1") return operator();
          if (args.where.id === "replacement-1") return replacement;
          return target;
        }),
        update: vi.fn().mockResolvedValue(suspended)
      },
      drama: {
        count: vi.fn().mockResolvedValue(2),
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
    };
    const result = await service(transactionPrisma(tx)).suspend(
      "operator-1",
      "editor-1",
      "123456",
      "编辑离职需要移交剧目",
      "replacement-1"
    );
    expect(result.status).toBe(AdminAccountStatus.SUSPENDED);
    expect(tx.drama.updateMany).toHaveBeenCalledWith({
      where: { editorId: "editor-1" },
      data: { editorId: "replacement-1" }
    });
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "editor-1" },
        data: { active: false, sessionVersion: { increment: 1 } }
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadataJson: expect.objectContaining({
            reason: "编辑离职需要移交剧目",
            transferredDramas: 2
          })
        })
      })
    );
  });

  it("credential reset immediately disables credentials and invalidates sessions", async () => {
    const target = account({ id: "reviewer-1", role: AdminRole.REVIEWER });
    const pending = {
      ...target,
      passwordHash: null,
      active: false,
      setupCompletedAt: null,
      sessionVersion: 2,
      totpEnabled: false,
      totpSecretEncrypted: null
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "operator-1" }]),
      adminUser: {
        findUnique: vi.fn(async (args: { where: { id?: string } }) =>
          args.where.id === "operator-1" ? operator() : target
        ),
        update: vi.fn().mockResolvedValue(pending),
        findUniqueOrThrow: vi.fn().mockResolvedValue(pending)
      },
      drama: { count: vi.fn().mockResolvedValue(0) },
      adminSetupToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: "reset-token" })
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
    };
    const prisma = transactionPrisma(tx, {
      adminUser: {
        findUnique: vi.fn().mockResolvedValue({ email: target.email })
      }
    });
    const result = await service(prisma).resetCredentials(
      "operator-1",
      "reviewer-1",
      "123456",
      "审核账号凭据疑似泄露"
    );
    expect(result.purpose).toBe(AdminSetupPurpose.CREDENTIAL_RESET);
    expect(result.account.status).toBe(AdminAccountStatus.PENDING_SETUP);
    expect(tx.adminUser.update).toHaveBeenCalledWith({
      where: { id: "reviewer-1" },
      data: {
        passwordHash: null,
        active: false,
        setupCompletedAt: null,
        sessionVersion: { increment: 1 },
        totpEnabled: false,
        totpSecretEncrypted: null
      }
    });
  });
});

describe("public administrator setup", () => {
  it("reveals the authenticator material only through inspect", async () => {
    const row = {
      id: "setup-1",
      adminUserId: "target-1",
      purpose: AdminSetupPurpose.INVITE,
      tokenDigest: "digest",
      totpSecretEncrypted: "encrypted-setup-secret",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      adminUser: account({ setupCompletedAt: null })
    };
    const result = await setupService({
      adminSetupToken: { findUnique: vi.fn().mockResolvedValue(row) }
    }).inspectSetup("a".repeat(43));
    expect(result).toMatchObject({
      purpose: AdminSetupPurpose.INVITE,
      manualKey: "ABCDEFGHIJKLMNOPQRSTUVWX23456789",
      otpauthUri: "otpauth://visible-only-to-inspect"
    });
  });

  it("atomically completes password and TOTP setup and rejects replay", async () => {
    const rawToken = "r".repeat(43);
    const row = {
      id: "setup-1",
      adminUserId: "target-1",
      purpose: AdminSetupPurpose.INVITE,
      tokenDigest: createHash("sha256").update(rawToken).digest("hex"),
      totpSecretEncrypted: "encrypted-setup-secret",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null as Date | null,
      adminUser: account({ setupCompletedAt: null, passwordHash: null })
    };
    const completed = account({
      setupCompletedAt: new Date(),
      active: true,
      totpEnabled: true,
      totpSecretEncrypted: "encrypted-setup-secret"
    });
    const auditLog = { create: vi.fn().mockResolvedValue({ id: "audit-1" }) };
    const operationalEvent = { create: vi.fn().mockResolvedValue({ id: "event-1" }) };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: row.id }]),
      adminSetupToken: {
        findUnique: vi.fn().mockImplementation(async () => row),
        update: vi.fn().mockImplementation(async (_args: unknown) => {
          row.usedAt = new Date();
          return row;
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      adminUser: { update: vi.fn().mockResolvedValue(completed) },
      auditLog,
      operationalEvent
    };
    const prisma = transactionPrisma(tx, {
      adminSetupToken: { findUnique: vi.fn().mockImplementation(async () => row) }
    });
    const result = await setupService(prisma).completeSetup({
      token: rawToken,
      password: "a-secure-password",
      otp: "123456"
    });
    expect(result.account.status).toBe(AdminAccountStatus.ACTIVE);
    const passwordHash = tx.adminUser.update.mock.calls[0]?.[0].data.passwordHash;
    expect(passwordHash).not.toBe("a-secure-password");
    await expect(compare("a-secure-password", passwordHash)).resolves.toBe(true);
    expect(tx.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          active: true,
          sessionVersion: { increment: 1 },
          totpEnabled: true,
          totpSecretEncrypted: "encrypted-setup-secret"
        })
      })
    );
    expect(operationalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "ADMIN_SETUP_COMPLETED" })
      })
    );
    const auditPayload = JSON.stringify({
      audit: auditLog.create.mock.calls,
      event: operationalEvent.create.mock.calls
    });
    expect(auditPayload).not.toContain(rawToken);
    expect(auditPayload).not.toContain("a-secure-password");
    expect(auditPayload).not.toContain("123456");
    expect(auditPayload).not.toContain("encrypted-setup-secret");

    await expect(
      setupService(prisma).completeSetup({
        token: rawToken,
        password: "a-secure-password",
        otp: "123456"
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.ADMIN_SETUP_TOKEN_USED });
  });

  it("rejects expired setup tokens", async () => {
    const row = {
      id: "setup-1",
      adminUserId: "target-1",
      purpose: AdminSetupPurpose.INVITE,
      totpSecretEncrypted: "encrypted-setup-secret",
      expiresAt: new Date(Date.now() - 1),
      usedAt: null,
      adminUser: account({ setupCompletedAt: null })
    };
    await expect(
      setupService({ adminSetupToken: { findUnique: vi.fn().mockResolvedValue(row) } })
        .inspectSetup("x".repeat(43))
    ).rejects.toMatchObject({ code: ERROR_CODES.ADMIN_SETUP_TOKEN_EXPIRED });
  });
});
