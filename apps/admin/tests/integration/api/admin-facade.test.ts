import { describe, expect, it } from "vitest";
import { adminApi } from "@/api/admin";

const domainMethods = [
  "login",
  "refresh",
  "logout",
  "inspectAccountSetup",
  "completeAccountSetup",
  "dashboard",
  "listAccounts",
  "createAccount",
  "updateAccount",
  "suspendAccount",
  "activateAccount",
  "createAccountSetupLink",
  "releaseGate",
  "uploadCapabilities",
  "listCatalogTags",
  "createCatalogTag",
  "patchCatalogTag",
  "getCatalogTag",
  "deleteCatalogTag",
  "listDramas",
  "getDrama",
  "uploadPoster",
  "saveDrama",
  "submitReview",
  "publish",
  "offline",
  "uploadEpisode",
  "listReviews",
  "review",
  "listNotifications",
  "getNotification",
  "createNotification",
  "updateNotification",
  "deleteNotification",
  "publishNotification",
  "retractNotification",
  "listFeedback",
  "getFeedback",
  "updateFeedback",
  "replyFeedback",
  "listAuditLogs",
  "listCallbackEvents",
  "getCircuitBreaker",
  "setCircuitBreaker",
  "compensate",
  "adjustEntitlement",
  "replayCallback",
  "reissueDeletionQueryToken",
] as const;

describe("adminApi compatibility facade", () => {
  it("keeps the existing metadata and domain method surface", () => {
    expect(adminApi.mode === "mock" || adminApi.mode === "live").toBe(true);
    expect(typeof adminApi.baseUrl).toBe("string");
    expect(typeof adminApi.hasSession).toBe("function");

    for (const method of domainMethods) {
      expect(adminApi[method], method).toBeTypeOf("function");
    }
  });
});
