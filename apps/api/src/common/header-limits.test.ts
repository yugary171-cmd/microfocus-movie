import { BEARER_TOKEN_MAX_LENGTH } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { requireBearerToken } from "./header-limits.js";

describe("bearer token bounds", () => {
  it("accepts a Bearer token within the contract length", () => {
    expect(requireBearerToken("Bearer access-token")).toBe("access-token");
    expect(requireBearerToken(`Bearer ${"a".repeat(BEARER_TOKEN_MAX_LENGTH)}`)).toHaveLength(
      BEARER_TOKEN_MAX_LENGTH
    );
  });

  it("rejects missing, empty, or oversized tokens before verification", () => {
    expect(() => requireBearerToken(undefined)).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => requireBearerToken("Basic abc")).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => requireBearerToken("Bearer ")).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => requireBearerToken(`Bearer ${"a".repeat(BEARER_TOKEN_MAX_LENGTH + 1)}`)).toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
  });
});
