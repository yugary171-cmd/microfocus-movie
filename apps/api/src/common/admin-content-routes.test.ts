import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { AdminController } from "../admin/admin.module.js";
import { nestedControllerPath } from "./http.js";

function routeOf(handler: object) {
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler)
  };
}

function adminMethod(route: string) {
  return nestedControllerPath(route, API_ROUTES.admin.root);
}

describe("admin content Nest routes follow contracts", () => {
  it("keeps the shared /v1/admin prefix on the controller", () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe("v1/admin");
  });

  it("binds drama, rights, media, review, and audit handlers to API_ROUTES.admin", () => {
    expect(routeOf(AdminController.prototype.dashboard)).toEqual({
      path: adminMethod(API_ROUTES.admin.dashboard),
      method: RequestMethod.GET
    });
    expect(routeOf(AdminController.prototype.dramas)).toEqual({
      path: adminMethod(API_ROUTES.admin.dramas),
      method: RequestMethod.GET
    });
    expect(routeOf(AdminController.prototype.createDrama)).toEqual({
      path: adminMethod(API_ROUTES.admin.dramas),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.drama)).toEqual({
      path: adminMethod(API_ROUTES.admin.drama(":dramaId")),
      method: RequestMethod.GET
    });
    expect(routeOf(AdminController.prototype.updateDrama)).toEqual({
      path: adminMethod(API_ROUTES.admin.drama(":dramaId")),
      method: RequestMethod.PATCH
    });
    expect(routeOf(AdminController.prototype.addRights)).toEqual({
      path: adminMethod(API_ROUTES.admin.rights(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.addMedia)).toEqual({
      path: adminMethod(API_ROUTES.admin.mediaAssets(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.submitReview)).toEqual({
      path: adminMethod(API_ROUTES.admin.submitReview(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.review)).toEqual({
      path: adminMethod(API_ROUTES.admin.review(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.publish)).toEqual({
      path: adminMethod(API_ROUTES.admin.publish(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.offline)).toEqual({
      path: adminMethod(API_ROUTES.admin.offline(":dramaId")),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.uploadSign)).toEqual({
      path: adminMethod(API_ROUTES.admin.uploadSign),
      method: RequestMethod.POST
    });
    expect(routeOf(AdminController.prototype.reviewMedia)).toEqual({
      path: adminMethod(API_ROUTES.admin.mediaReview(":assetId")),
      method: RequestMethod.PATCH
    });
    expect(routeOf(AdminController.prototype.reviews)).toEqual({
      path: adminMethod(API_ROUTES.admin.reviews),
      method: RequestMethod.GET
    });
    expect(routeOf(AdminController.prototype.auditLogs)).toEqual({
      path: adminMethod(API_ROUTES.admin.auditLogs),
      method: RequestMethod.GET
    });
  });
});
