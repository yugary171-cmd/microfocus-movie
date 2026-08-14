import { describe, expect, it } from "vitest";
import {
  assertTotpSecretBase32,
  decodeTotpSecretBase32,
  isExampleTotpSecret
} from "./totp-secret.js";

describe("TOTP Base32 secrets", () => {
  it("accepts a spaced authenticator secret and decodes at least 80 bits", () => {
    const secret = assertTotpSecretBase32("jbsw y3dp ehpk 3pxp");
    expect(secret).toBe("JBSWY3DPEHPK3PXP");
    expect(decodeTotpSecretBase32(secret).length).toBeGreaterThanOrEqual(10);
  });

  it("rejects short or non-Base32 values without echoing the input", () => {
    expect(() => assertTotpSecretBase32("AAAA")).toThrow(/Base32/);
    expect(() => assertTotpSecretBase32("not-base32!!!!!!!!")).toThrow(/Base32/);
  });

  it("flags well-known example secrets", () => {
    expect(isExampleTotpSecret("JBSWY3DPEHPK3PXP")).toBe(true);
    expect(isExampleTotpSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")).toBe(false);
  });
});
