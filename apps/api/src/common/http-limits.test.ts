import { describe, expect, it, vi } from "vitest";
import { JSON_BODY_LIMIT } from "@microfocus/contracts";
import { applyJsonBodyLimit } from "./http-limits.js";

describe("JSON body limit", () => {
  it("registers a 64kb json and urlencoded parser", () => {
    const useBodyParser = vi.fn();
    applyJsonBodyLimit({ useBodyParser });
    expect(JSON_BODY_LIMIT).toBe("64kb");
    expect(useBodyParser).toHaveBeenCalledWith("json", { limit: JSON_BODY_LIMIT });
    expect(useBodyParser).toHaveBeenCalledWith("urlencoded", {
      limit: JSON_BODY_LIMIT,
      extended: true
    });
  });
});
