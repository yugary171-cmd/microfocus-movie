import { describe, expect, it } from "vitest";
import { currentTotp, TotpService } from "./totp.service.js";

const encryptionKey = "totp-test-key-material-that-is-at-least-32-characters";

function service(overrides: Record<string, unknown> = {}): TotpService {
  return new TotpService({
    env: {
      NODE_ENV: "test",
      TOTP_ENCRYPTION_KEY: encryptionKey,
      TOTP_ENCRYPTION_KEY_PREVIOUS: undefined,
      ADMIN_TEST_OTP: undefined,
      ...overrides
    }
  } as never);
}

describe("shared administrator TOTP service", () => {
  it("generates encrypted setup secrets and verifies a configured authenticator code", () => {
    const totp = service();
    const setup = totp.createSetupSecret("Admin@Example.com");
    const otp = currentTotp(setup.manualKey);

    expect(setup.encryptedSecret).toMatch(/^v1\./);
    expect(setup.manualKey).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.otpauthUri).toContain("otpauth://totp/");
    expect(setup.otpauthUri).toContain("Admin%40Example.com".toLowerCase());
    expect(totp.verifySetupOtp(setup.encryptedSecret, otp)).toBe(true);
    expect(totp.verifySetupOtp(setup.encryptedSecret, "000000")).toBe(false);
  });

  it("uses the non-production test OTP only for existing administrator reauthentication", () => {
    const totp = service({ ADMIN_TEST_OTP: "123456" });
    expect(
      totp.verifyAdminOtp(
        { totpEnabled: false, totpSecretEncrypted: null },
        "123456"
      )
    ).toBe(true);
  });

  it("fails closed when setup secret encryption is not configured", () => {
    expect(() => service({ TOTP_ENCRYPTION_KEY: undefined }).createSetupSecret("a@b.com"))
      .toThrow(/not configured/);
  });
});
