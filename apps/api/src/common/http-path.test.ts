import { describe, expect, it } from "vitest";
import { API_ROUTES } from "@microfocus/contracts";
import { controllerPath, nestedControllerPath } from "./http.js";

describe("nestedControllerPath", () => {
  it("strips the admin prefix used by AdminController", () => {
    expect(controllerPath(API_ROUTES.admin.root)).toBe("v1/admin");
    expect(nestedControllerPath(API_ROUTES.admin.dashboard, API_ROUTES.admin.root)).toBe(
      "dashboard"
    );
    expect(nestedControllerPath(API_ROUTES.admin.drama(":dramaId"), API_ROUTES.admin.root)).toBe(
      "dramas/:dramaId"
    );
    expect(nestedControllerPath(API_ROUTES.admin.mediaReview(":assetId"), API_ROUTES.admin.root)).toBe(
      "media-assets/:assetId/review"
    );
    expect(nestedControllerPath(API_ROUTES.admin.root, API_ROUTES.admin.root)).toBe("");
  });

  it("rejects a route outside the controller prefix", () => {
    expect(() => nestedControllerPath(API_ROUTES.catalog, API_ROUTES.admin.root)).toThrow(
      /not under controller prefix/
    );
  });
});
