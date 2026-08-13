import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { API_ROUTES } from "@microfocus/contracts";
import { describe, expect, it } from "vitest";
import { HistoryController } from "./history.module.js";

describe("history routes", () => {
  it("exposes progress as PUT on the shared route", () => {
    const handler = HistoryController.prototype.progress;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(API_ROUTES.progress.replace(/^\//, ""));
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PUT);
  });
});
