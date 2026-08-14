import { ENTITY_ID_MAX_LENGTH } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { optionalEntityId, requireEntityId } from "./entity-id.js";

describe("entity id bounds", () => {
  it("accepts a trimmed id within the contract length", () => {
    expect(requireEntityId("  drama-1  ", "dramaId")).toBe("drama-1");
    expect(requireEntityId("a".repeat(ENTITY_ID_MAX_LENGTH), "dramaId")).toHaveLength(
      ENTITY_ID_MAX_LENGTH
    );
  });

  it("rejects empty or oversized ids before a database lookup", () => {
    expect(() => requireEntityId("", "dramaId")).toThrow(
      expect.objectContaining({ code: "INVALID_ENTITY_ID" })
    );
    expect(() => requireEntityId("   ", "leaseId")).toThrow(
      expect.objectContaining({ code: "INVALID_ENTITY_ID" })
    );
    expect(() => requireEntityId("x".repeat(ENTITY_ID_MAX_LENGTH + 1), "dramaId")).toThrow(
      expect.objectContaining({ code: "INVALID_ENTITY_ID" })
    );
    expect(optionalEntityId(undefined, "provider")).toBeUndefined();
    expect(optionalEntityId("", "provider")).toBeUndefined();
    expect(() => optionalEntityId("p".repeat(ENTITY_ID_MAX_LENGTH + 1), "provider")).toThrow(
      expect.objectContaining({ code: "INVALID_ENTITY_ID" })
    );
  });
});
