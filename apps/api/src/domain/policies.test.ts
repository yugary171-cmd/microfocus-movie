import { describe, expect, it } from "vitest";
import { PLAYBACK_RATE_MAX, RIGHTS_MATERIAL_DIGEST_LENGTH, RIGHTS_TERRITORY } from "@microfocus/contracts";
import {
  allocateFefo,
  assertHeartbeatAnchor,
  heartbeatDebitSeconds,
  isLeaseFresh,
  nextMediaAnchor,
  publicationBlockers
} from "./policies.js";

describe("entitlement FEFO allocation", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("uses the earliest expiry first", () => {
    const result = allocateFefo(
      [
        { id: "later", remainingSeconds: 20, expiresAt: new Date("2026-01-03T00:00:00Z") },
        { id: "first", remainingSeconds: 5, expiresAt: new Date("2026-01-02T00:00:00Z") }
      ],
      8,
      now
    );
    expect(result.debits).toEqual([
      { id: "first", seconds: 5 },
      { id: "later", seconds: 3 }
    ]);
    expect(result.remainingSeconds).toBe(17);
  });

  it("ignores expired grants", () => {
    const result = allocateFefo(
      [{ id: "expired", remainingSeconds: 600, expiresAt: now }],
      5,
      now
    );
    expect(result).toEqual({ debits: [], debitedSeconds: 0, remainingSeconds: 0 });
  });

  it("never reports or debits a negative balance", () => {
    const result = allocateFefo(
      [{ id: "broken", remainingSeconds: -20, expiresAt: new Date("2026-01-02T00:00:00Z") }],
      5,
      now
    );
    expect(result.remainingSeconds).toBe(0);
    expect(result.debits).toEqual([]);
  });
});

describe("heartbeat debit policy", () => {
  it("does not debit paused playback", () => {
    expect(
      heartbeatDebitSeconds({
        state: "paused",
        mediaPositionSeconds: 30,
        lastMediaPositionSeconds: 10,
        serverElapsedSeconds: 5,
        playbackRate: 1,
        isFree: false
      })
    ).toBe(0);
  });

  it("debits only positive media progress and never free episodes", () => {
    expect(
      heartbeatDebitSeconds({
        state: "playing",
        mediaPositionSeconds: 16.8,
        lastMediaPositionSeconds: 10.2,
        serverElapsedSeconds: 5,
        playbackRate: 1,
        isFree: false
      })
    ).toBe(6);
    expect(
      heartbeatDebitSeconds({
        state: "playing",
        mediaPositionSeconds: 60,
        lastMediaPositionSeconds: 10,
        serverElapsedSeconds: 5,
        playbackRate: 1,
        isFree: true
      })
    ).toBe(0);
    expect(
      heartbeatDebitSeconds({
        state: "playing",
        mediaPositionSeconds: 5,
        lastMediaPositionSeconds: 10,
        serverElapsedSeconds: 5,
        playbackRate: 1,
        isFree: false
      })
    ).toBe(0);
  });

  it("caps forward seeks by server-observed playback time", () => {
    expect(
      heartbeatDebitSeconds({
        state: "playing",
        mediaPositionSeconds: 300,
        lastMediaPositionSeconds: 10,
        serverElapsedSeconds: 5,
        playbackRate: PLAYBACK_RATE_MAX,
        isFree: false
      })
    ).toBe(14);
    expect(
      heartbeatDebitSeconds({
        state: "playing",
        mediaPositionSeconds: 300,
        lastMediaPositionSeconds: 10,
        serverElapsedSeconds: 5,
        playbackRate: PLAYBACK_RATE_MAX + 1,
        isFree: false
      })
    ).toBe(14);
  });

  it("rejects a client anchor that diverges from the server anchor", () => {
    expect(() => assertHeartbeatAnchor(20, 10)).toThrow("HEARTBEAT_ANCHOR_MISMATCH");
    expect(() => assertHeartbeatAnchor(10.5, 10)).not.toThrow();
  });

  it("does not advance the server anchor while paused", () => {
    expect(
      nextMediaAnchor({
        state: "paused",
        serverLastMediaPositionSeconds: 10,
        clientMediaPositionSeconds: 90
      })
    ).toBe(10);
  });

  it("requires at least one recent heartbeat for renewal", () => {
    const now = new Date("2026-01-01T00:00:20Z");
    expect(
      isLeaseFresh({
        lastSeq: 0,
        lastHeartbeatAt: new Date("2026-01-01T00:00:19Z"),
        now,
        graceSeconds: 15
      })
    ).toBe(false);
    expect(
      isLeaseFresh({
        lastSeq: 1,
        lastHeartbeatAt: new Date("2026-01-01T00:00:00Z"),
        now,
        graceSeconds: 15
      })
    ).toBe(false);
  });
});

describe("publication gate", () => {
  const approvedAsset = {
    mediaStatus: "READY",
    transcodeStatus: "READY",
    machineReviewStatus: "APPROVED",
    manualReviewStatus: "APPROVED",
    wechatReviewStatus: "APPROVED"
  };
  const rights = {
    status: "ACTIVE",
    licenseNumber: "license",
    reportNumber: "report",
    validFrom: new Date("2025-01-01T00:00:00Z"),
    validUntil: new Date("2027-01-01T00:00:00Z"),
    territory: RIGHTS_TERRITORY,
    allowsWechatDistribution: true,
    allowsAdMonetization: true,
    allowsTranscoding: true,
    allowsPromotionalMaterial: true,
    materialObjectKey: "private/rights.pdf",
    materialDigestSha256: "a".repeat(RIGHTS_MATERIAL_DIGEST_LENGTH)
  };

  it("allows a fully approved drama reviewed by another admin", () => {
    expect(
      publicationBlockers({
        editorId: "editor",
        reviewerId: "reviewer",
        now: new Date("2026-01-01T00:00:00Z"),
        rights,
        episodes: [{ currentAsset: approvedAsset }]
      })
    ).toEqual([]);
  });

  it("blocks self review, incomplete rights and failed media gates", () => {
    const blockers = publicationBlockers({
      editorId: "editor",
      reviewerId: "editor",
      now: new Date("2026-01-01T00:00:00Z"),
      rights: { ...rights, allowsAdMonetization: false },
      episodes: [{ currentAsset: { ...approvedAsset, manualReviewStatus: "REJECTED" } }]
    });
    expect(blockers).toContain("SELF_REVIEW_FORBIDDEN");
    expect(blockers).toContain("RIGHTS_SCOPE_INCOMPLETE");
    expect(blockers).toContain("MANUAL_REVIEW_REQUIRED");
  });

  it("blocks a rights territory outside the contract allowlist", () => {
    expect(
      publicationBlockers({
        editorId: "editor",
        reviewerId: "reviewer",
        now: new Date("2026-01-01T00:00:00Z"),
        rights: { ...rights, territory: "US" },
        episodes: [{ currentAsset: approvedAsset }]
      })
    ).toContain("CN_TERRITORY_REQUIRED");
  });
});
