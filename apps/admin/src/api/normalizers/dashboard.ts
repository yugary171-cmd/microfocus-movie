import {
  DramaStatus,
  type ReleaseGateStatus
} from "@microfocus/contracts";
import type {
  DashboardData
} from "@/shared/types";

import {
  record,
  array,
  text,
  finiteNumber
} from "./primitives";

export function normalizeReleaseGate(value: unknown): ReleaseGateStatus {
  const source = record(value);
  const entityApproved = source.entityApproved === true;
  const miniProgramFilingApproved = source.miniProgramFilingApproved === true;
  const wechatCategoryApproved = source.wechatCategoryApproved === true;
  const adsApproved = source.adsApproved === true;
  return {
    entityApproved,
    miniProgramFilingApproved,
    wechatCategoryApproved,
    adsApproved,
    readyForExternalTraffic:
      source.readyForExternalTraffic === true &&
      entityApproved &&
      miniProgramFilingApproved &&
      wechatCategoryApproved &&
      adsApproved,
    blockers: array(source.blockers).filter((item): item is string => typeof item === "string"),
  };
}

export function normalizeDashboard(value: unknown, gateValue: unknown): DashboardData {
  const source = record(value);
  const statusCountsSource = record(source.statusCounts);
  const statusCounts = Object.fromEntries(
    Object.values(DramaStatus).map((status) => [
      status,
      Math.max(0, Math.round(finiteNumber(statusCountsSource[status]))),
    ]),
  ) as Partial<Record<DramaStatus, number>>;
  if (!(DramaStatus.PUBLISHED in statusCountsSource) && finiteNumber(source.published) > 0) {
    statusCounts[DramaStatus.PUBLISHED] = Math.round(finiteNumber(source.published));
  }
  if (!(DramaStatus.PENDING_REVIEW in statusCountsSource) && finiteNumber(source.pendingReviews) > 0) {
    statusCounts[DramaStatus.PENDING_REVIEW] = Math.round(finiteNumber(source.pendingReviews));
  }
  return {
    releaseGate: normalizeReleaseGate(gateValue),
    statusCounts,
    reviewBacklog: Math.max(
      0,
      Math.round(finiteNumber(source.reviewBacklog ?? source.pendingReviews)),
    ),
    metricSourceConfigured: source.metricSourceConfigured === true,
    callbackOps: normalizeCallbackOps(source.callbackOps),
    ledgerOps: normalizeLedgerOps(source.ledgerOps),
  };
}

export function normalizeCallbackOps(value: unknown): DashboardData["callbackOps"] {
  const source = record(value);
  const oldest = source.oldestUnprocessedAgeSeconds;
  return {
    deadLetterCount: Math.max(0, Math.round(finiteNumber(source.deadLetterCount))),
    retryableCount: Math.max(0, Math.round(finiteNumber(source.retryableCount))),
    oldestUnprocessedAgeSeconds:
      typeof oldest === "number" && Number.isFinite(oldest) ? Math.max(0, Math.round(oldest)) : null,
    openProviderCircuits: array(source.openProviderCircuits).filter(
      (item): item is string => typeof item === "string" && item.startsWith("PROVIDER:"),
    ),
  };
}

export function normalizeLedgerOps(value: unknown): DashboardData["ledgerOps"] {
  const source = record(value);
  const lastReconciledAt = text(source.lastReconciledAt);
  return {
    mismatchCount: Math.max(0, Math.round(finiteNumber(source.mismatchCount))),
    mismatchedSeconds: Math.max(0, Math.round(finiteNumber(source.mismatchedSeconds))),
    missingGrants: Math.max(0, Math.round(finiteNumber(source.missingGrants))),
    lastReconciledAt: lastReconciledAt || null,
    ledgerCircuitOpen: source.ledgerCircuitOpen === true,
  };
}
