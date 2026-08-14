import { describe, expect, it } from "vitest";
import { shouldMountOpenApiDocs } from "./open-api.js";

describe("OpenAPI docs exposure", () => {
  it("keeps Swagger available for local development and tests", () => {
    expect(shouldMountOpenApiDocs("development")).toBe(true);
    expect(shouldMountOpenApiDocs("test")).toBe(true);
  });

  it("does not mount OpenAPI in production", () => {
    expect(shouldMountOpenApiDocs("production")).toBe(false);
  });
});
