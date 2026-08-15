import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { CatalogController } from "../catalog/catalog.module.js";
import { EntitlementsController } from "../entitlements/entitlements.module.js";
import { PlaybackController } from "../playback/playback.module.js";
import { DeletionController } from "../privacy/privacy.module.js";
import { ProfileController } from "../profile/profile.module.js";
import { controllerPath } from "./http.js";

function routeOf(handler: object) {
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler)
  };
}

describe("user-facing Nest routes follow contracts", () => {
  it("does not prefix playback, entitlements, or deletion with a second controller path", () => {
    expect(Reflect.getMetadata(PATH_METADATA, PlaybackController)).toBe("/");
    expect(Reflect.getMetadata(PATH_METADATA, EntitlementsController)).toBe("/");
    expect(Reflect.getMetadata(PATH_METADATA, DeletionController)).toBe("/");
  });

  it("binds drama detail, entitlements, and deletion to API_ROUTES", () => {
    expect(routeOf(CatalogController.prototype.detail)).toEqual({
      path: controllerPath(API_ROUTES.drama(":dramaId")),
      method: RequestMethod.GET
    });
    expect(routeOf(EntitlementsController.prototype.summary)).toEqual({
      path: controllerPath(API_ROUTES.entitlement(":dramaId")),
      method: RequestMethod.GET
    });
    expect(routeOf(DeletionController.prototype.create)).toEqual({
      path: controllerPath(API_ROUTES.deletionRequests),
      method: RequestMethod.POST
    });
    expect(routeOf(DeletionController.prototype.lookup)).toEqual({
      path: controllerPath(API_ROUTES.deletionRequest(":deletionRequestId")),
      method: RequestMethod.GET
    });
    expect(routeOf(ProfileController.prototype.getProfile)).toEqual({
      path: controllerPath(API_ROUTES.profile),
      method: RequestMethod.GET
    });
    expect(routeOf(ProfileController.prototype.updateProfile)).toEqual({
      path: controllerPath(API_ROUTES.profile),
      method: RequestMethod.PATCH
    });
  });

  it("binds playback lease handlers to API_ROUTES", () => {
    expect(routeOf(PlaybackController.prototype.create)).toEqual({
      path: controllerPath(API_ROUTES.playbackLeases),
      method: RequestMethod.POST
    });
    expect(routeOf(PlaybackController.prototype.active)).toEqual({
      path: controllerPath(API_ROUTES.playbackActive),
      method: RequestMethod.GET
    });
    expect(routeOf(PlaybackController.prototype.heartbeat)).toEqual({
      path: controllerPath(API_ROUTES.playbackHeartbeat(":leaseId")),
      method: RequestMethod.POST
    });
    expect(routeOf(PlaybackController.prototype.renew)).toEqual({
      path: controllerPath(API_ROUTES.playbackRenew(":leaseId")),
      method: RequestMethod.POST
    });
    expect(routeOf(PlaybackController.prototype.recover)).toEqual({
      path: controllerPath(API_ROUTES.playbackRecover(":leaseId")),
      method: RequestMethod.POST
    });
    expect(routeOf(PlaybackController.prototype.close)).toEqual({
      path: controllerPath(API_ROUTES.playbackLease(":leaseId")),
      method: RequestMethod.DELETE
    });
  });
});
