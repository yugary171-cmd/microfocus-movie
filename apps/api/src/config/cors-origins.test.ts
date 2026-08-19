import { describe, expect, it } from "vitest";
import { resolveAdminCorsOrigins } from "./cors-origins.js";

describe("resolveAdminCorsOrigins", () => {
  it("keeps production locked to ADMIN_ORIGIN", () => {
    expect(resolveAdminCorsOrigins("https://admin.example.invalid/", "production")).toEqual([
      "https://admin.example.invalid"
    ]);
  });

  it("allows the documented local admin origin even if ADMIN_ORIGIN still points at 5173", () => {
    const origins = resolveAdminCorsOrigins("http://localhost:5173", "development");
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://localhost:5174");
    expect(origins).toContain("http://127.0.0.1:5174");
  });
});
