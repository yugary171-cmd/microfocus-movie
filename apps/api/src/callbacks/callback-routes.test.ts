import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { controllerPath } from "../common/http.js";
import { CallbacksController } from "./callbacks.module.js";

function routeOf(handler: object) {
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler)
  };
}

describe("provider callback Nest routes follow contracts", () => {
  it("does not prefix callback handlers with a second controller path", () => {
    expect(Reflect.getMetadata(PATH_METADATA, CallbacksController)).toBe("/");
  });

  it("binds VOD and reward callbacks to API_ROUTES.callbacks", () => {
    expect(API_ROUTES.callbacks.vod).toBe("/v1/callbacks/vod");
    expect(API_ROUTES.callbacks.reward).toBe("/v1/callbacks/reward");
    expect(routeOf(CallbacksController.prototype.vod)).toEqual({
      path: controllerPath(API_ROUTES.callbacks.vod),
      method: RequestMethod.POST
    });
    expect(routeOf(CallbacksController.prototype.reward)).toEqual({
      path: controllerPath(API_ROUTES.callbacks.reward),
      method: RequestMethod.POST
    });
  });
});
