import { describe, expect, it, vi } from "vitest";
import {
  DEVICE_ID_MAX_LENGTH,
  ENTITY_ID_MAX_LENGTH,
  ERROR_CODES,
  PLAYBACK_RECOVERY_GRACE_LIMIT,
  PLAYBACK_WINDOW_SECONDS,
  REWARD_SECONDS,
  UNCONFIRMED_EXPOSURE_LIMIT
} from "@microfocus/contracts";
import {
  assertCanOpenPaidLease,
  allowedDebitSeconds,
  confirmReservationWindow,
  hasVodPlaybackDeliveryEvidence,
  recoverActionFor,
  recoverReservations,
  unconfirmedAutoSettlement
} from "./playback-reservations.js";

describe("playback reservations", () => {
  it("blocks a locked lease once unconfirmed exposure reaches the limit", async () => {
    const db = {
      playbackReservation: { count: vi.fn().mockResolvedValue(UNCONFIRMED_EXPOSURE_LIMIT) }
    };

    await expect(
      assertCanOpenPaidLease(db as never, {
        userId: "user",
        deviceId: "device",
        dramaId: "drama",
        allocatableSeconds: REWARD_SECONDS
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.UNCONFIRMED_EXPOSURE_LIMIT });
  });

  it("routes recovery to customer service after the rolling grace is exhausted", () => {
    expect(recoverActionFor(PLAYBACK_RECOVERY_GRACE_LIMIT - 1, PLAYBACK_RECOVERY_GRACE_LIMIT)).toBe("customer_service");
    expect(recoverActionFor(1, 0)).toBe("recover");
    expect(recoverActionFor(0, 0)).toBe("none");
  });

  it("never auto-debits unconfirmed windows when VOD delivery logs are absent", async () => {
    expect(hasVodPlaybackDeliveryEvidence()).toBe(false);
    expect(unconfirmedAutoSettlement()).toBe("release");
    expect(allowedDebitSeconds({ requestedSeconds: PLAYBACK_WINDOW_SECONDS, unconfirmedCount: 1 })).toBe(0);
    expect(allowedDebitSeconds({ requestedSeconds: PLAYBACK_WINDOW_SECONDS, unconfirmedCount: 0 })).toBe(PLAYBACK_WINDOW_SECONDS);
  });

  it("releases unconfirmed windows and records a recovery event within grace", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: "event" });
    const entitlementDebit = { create: vi.fn() };
    const db = {
      playbackReservation: {
        count: vi.fn().mockResolvedValue(1),
        updateMany,
        findFirst: vi.fn()
      },
      playbackRecoveryEvent: {
        count: vi.fn().mockResolvedValue(0),
        create
      },
      entitlementDebit
    };

    await expect(
      recoverReservations(db as never, {
        userId: "user",
        deviceId: "device",
        leaseId: "lease",
        reason: "client_resume",
        now: new Date()
      })
    ).resolves.toBe("recover");
    expect(create).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RELEASED" })
      })
    );
    expect(entitlementDebit.create).not.toHaveBeenCalled();
  });

  it("caps stored recovery deviceId and reason to contract limits", async () => {
    const create = vi.fn().mockResolvedValue({ id: "event" });
    const count = vi.fn().mockResolvedValue(0);
    const db = {
      playbackReservation: {
        count: vi.fn().mockResolvedValue(1),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn()
      },
      playbackRecoveryEvent: { count, create },
      entitlementDebit: { create: vi.fn() }
    };
    const deviceId = "d".repeat(DEVICE_ID_MAX_LENGTH + 8);
    const reason = "r".repeat(ENTITY_ID_MAX_LENGTH + 8);

    await recoverReservations(db as never, {
      userId: "user",
      deviceId,
      leaseId: "lease",
      reason,
      now: new Date()
    });

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deviceId: "d".repeat(DEVICE_ID_MAX_LENGTH)
      })
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user",
        deviceId: "d".repeat(DEVICE_ID_MAX_LENGTH),
        leaseId: "lease",
        reason: "r".repeat(ENTITY_ID_MAX_LENGTH)
      }
    });
  });

  it("does not confirm an unconfirmed window as a heartbeat settlement", async () => {
    const update = vi.fn();
    const db = {
      playbackReservation: {
        findFirst: vi.fn().mockResolvedValue(null),
        update
      }
    };
    await expect(
      confirmReservationWindow(db as never, {
        leaseId: "lease",
        windowId: "unconfirmed-window",
        heartbeatId: "hb-1"
      })
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses automatic recovery after the grace limit", async () => {
    const db = {
      playbackReservation: { count: vi.fn().mockResolvedValue(1), updateMany: vi.fn() },
      playbackRecoveryEvent: { count: vi.fn().mockResolvedValue(PLAYBACK_RECOVERY_GRACE_LIMIT), create: vi.fn() }
    };

    await expect(
      recoverReservations(db as never, {
        userId: "user",
        deviceId: "device",
        leaseId: "lease",
        reason: "client_resume",
        now: new Date()
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.CUSTOMER_SERVICE_REQUIRED });
  });
});
