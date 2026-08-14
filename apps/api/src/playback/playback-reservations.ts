import {
  OFFLINE_GRACE_SECONDS,
  PLAYBACK_RECOVERY_GRACE_LIMIT,
  PLAYBACK_WINDOW_SECONDS,
  PlaybackReservationStatus,
  UNCONFIRMED_EXPOSURE_LIMIT,
  type PlaybackReservationView
} from "@microfocus/contracts";
import type { Prisma, PrismaClient } from "@prisma/client";
import { Errors } from "../common/app-error.js";
import { ERROR_CODES } from "@microfocus/contracts";

import { LIVE_PROVIDER_IMPLEMENTATIONS_READY } from "../providers/providers.js";

type Db = PrismaClient | Prisma.TransactionClient;

export function toReservationView(row: {
  id: string;
  leaseId: string;
  windowIndex: number;
  reservedSeconds: number;
  status: string;
  expiresAt: Date;
}): PlaybackReservationView {
  return {
    id: row.id,
    leaseId: row.leaseId,
    windowIndex: row.windowIndex,
    reservedSeconds: row.reservedSeconds,
    status: row.status as PlaybackReservationView["status"],
    expiresAt: row.expiresAt.toISOString()
  };
}

export async function reservedSecondsForUser(
  db: Db,
  userId: string,
  dramaId: string
): Promise<number> {
  const rows = await db.playbackReservation.findMany({
    where: {
      status: "RESERVED",
      lease: { userId, episode: { dramaId } }
    },
    select: { reservedSeconds: true }
  });
  return rows.reduce((sum, row) => sum + row.reservedSeconds, 0);
}

export async function unconfirmedCountForDevice(
  db: Db,
  userId: string,
  deviceId: string
): Promise<number> {
  return db.playbackReservation.count({
    where: {
      status: "UNCONFIRMED",
      lease: { userId, deviceId }
    }
  });
}

export async function assertCanOpenPaidLease(
  db: Db,
  input: { userId: string; deviceId: string; dramaId: string; allocatableSeconds: number }
): Promise<void> {
  const unconfirmed = await unconfirmedCountForDevice(db, input.userId, input.deviceId);
  if (unconfirmed >= UNCONFIRMED_EXPOSURE_LIMIT) {
    throw Errors.forbidden(
      ERROR_CODES.UNCONFIRMED_EXPOSURE_LIMIT,
      "Unconfirmed playback exposure must be recovered before a new locked lease"
    );
  }
  if (input.allocatableSeconds < PLAYBACK_WINDOW_SECONDS) {
    throw Errors.forbidden("ENTITLEMENT_REQUIRED", "No playback entitlement remains");
  }
}

export function hasVodPlaybackDeliveryEvidence(): boolean {
  return LIVE_PROVIDER_IMPLEMENTATIONS_READY;
}

export function unconfirmedAutoSettlement(): "release" {
  void hasVodPlaybackDeliveryEvidence();
  return "release";
}

export function allowedDebitSeconds(input: {
  requestedSeconds: number;
  unconfirmedCount: number;
}): number {
  if (input.unconfirmedCount > 0) return 0;
  return Math.max(0, input.requestedSeconds);
}

export async function createReservationWindow(
  db: Db,
  leaseId: string,
  windowIndex: number,
  now: Date
) {
  return db.playbackReservation.create({
    data: {
      leaseId,
      windowIndex,
      reservedSeconds: PLAYBACK_WINDOW_SECONDS,
      status: "RESERVED",
      expiresAt: new Date(now.getTime() + OFFLINE_GRACE_SECONDS * 1000)
    }
  });
}

export async function confirmReservationWindow(
  db: Db,
  input: { leaseId: string; windowId?: string; heartbeatId: string }
) {
  let current = input.windowId
    ? await db.playbackReservation.findFirst({
        where: { id: input.windowId, leaseId: input.leaseId, status: "RESERVED" }
      })
    : null;
  current ??= await db.playbackReservation.findFirst({
    where: { leaseId: input.leaseId, status: "RESERVED" },
    orderBy: { windowIndex: "desc" }
  });
  if (!current) return null;
  return db.playbackReservation.update({
    where: { id: current.id },
    data: { status: "CONFIRMED", confirmedHeartbeatId: input.heartbeatId }
  });
}

export async function releaseOpenReservations(db: Db, leaseId: string): Promise<void> {
  await db.playbackReservation.updateMany({
    where: { leaseId, status: "RESERVED" },
    data: { status: "RELEASED" }
  });
}

export async function markReservationsUnconfirmed(db: Db, leaseId: string): Promise<void> {
  await db.playbackReservation.updateMany({
    where: { leaseId, status: "RESERVED" },
    data: { status: "UNCONFIRMED" }
  });
}

export async function nextWindowIndex(db: Db, leaseId: string): Promise<number> {
  const last = await db.playbackReservation.findFirst({
    where: { leaseId },
    orderBy: { windowIndex: "desc" },
    select: { windowIndex: true }
  });
  return (last?.windowIndex ?? -1) + 1;
}

export async function recoverReservations(
  db: Db,
  input: { userId: string; deviceId: string; leaseId: string; reason: string; now: Date }
): Promise<"none" | "recover" | "customer_service"> {
  const unconfirmed = await db.playbackReservation.count({
    where: { leaseId: input.leaseId, status: "UNCONFIRMED" }
  });
  if (unconfirmed > 0) {
    const windowStart = new Date(input.now.getTime() - 24 * 60 * 60 * 1000);
    const graceUsed = await db.playbackRecoveryEvent.count({
      where: {
        userId: input.userId,
        deviceId: input.deviceId,
        createdAt: { gte: windowStart }
      }
    });
    if (graceUsed >= PLAYBACK_RECOVERY_GRACE_LIMIT) {
      throw Errors.forbidden(
        ERROR_CODES.CUSTOMER_SERVICE_REQUIRED,
        "Automatic recovery grace is exhausted; customer service must review this exposure"
      );
    }
    await db.playbackRecoveryEvent.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId.slice(0, 128),
        leaseId: input.leaseId,
        reason: input.reason.slice(0, 191)
      }
    });
    if (unconfirmedAutoSettlement() === "release") {
      await db.playbackReservation.updateMany({
        where: { leaseId: input.leaseId, status: "UNCONFIRMED" },
        data: { status: "RELEASED" }
      });
    }
  }
  await db.playbackReservation.updateMany({
    where: {
      leaseId: input.leaseId,
      status: "RESERVED",
      expiresAt: { lte: input.now }
    },
    data: { status: "RELEASED" }
  });
  return unconfirmed > 0 ? "recover" : "none";
}

export function recoverActionFor(
  unconfirmedCount: number,
  graceUsed: number
): "none" | "recover" | "customer_service" {
  if (unconfirmedCount <= 0) return "none";
  if (graceUsed >= PLAYBACK_RECOVERY_GRACE_LIMIT) return "customer_service";
  return "recover";
}

export { PlaybackReservationStatus };
