import { describe, expect, it } from "vitest";
import { publicSearchWhere } from "./catalog.module.js";

describe("catalog search filters", () => {
  it("supports category-only search when q is empty", () => {
    const where = publicSearchWhere("", "都市");
    expect(where).toMatchObject({ status: "PUBLISHED", category: "都市" });
    expect(where).not.toHaveProperty("OR");
  });
});
