import {
  type ReleaseGateStatus
} from "@microfocus/contracts";
import type {
  DashboardData
} from "@/shared/types";




import {
  state
} from "../state";

import {
  mockDelay
} from "../helpers";

export const dashboardMockApi = {
  async dashboard(): Promise<DashboardData> {
    const statusCounts = state.dramas.reduce<DashboardData["statusCounts"]>((counts, drama) => {
      counts[drama.status] = (counts[drama.status] ?? 0) + 1;
      return counts;
    }, {});
    return mockDelay({
      releaseGate: state.releaseGate,
      statusCounts,
      reviewBacklog: state.reviews.filter((item) => item.status === "PENDING").length,
      metricSourceConfigured: false,
      callbackOps: {
        deadLetterCount: 0,
        retryableCount: 0,
        oldestUnprocessedAgeSeconds: null,
        openProviderCircuits: [],
      },
      ledgerOps: {
        mismatchCount: 0,
        mismatchedSeconds: 0,
        missingGrants: 0,
        lastReconciledAt: null,
        ledgerCircuitOpen: false,
      },
    });
  },
  async releaseGate(): Promise<ReleaseGateStatus> {
    return mockDelay(state.releaseGate);
  },
};
