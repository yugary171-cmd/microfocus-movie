import { onMounted } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { useCallbackReplayOperation } from "./useCallbackReplayOperation";
import { useCircuitBreakerOperation } from "./useCircuitBreakerOperation";
import { useCompensationOperation } from "./useCompensationOperation";
import { useDeletionTokenReissueOperation } from "./useDeletionTokenReissueOperation";
import { useEntitlementAdjustmentOperation } from "./useEntitlementAdjustmentOperation";
import { useOperationsState } from "./useOperationsState";

export function useOperationsPage() {
  const state = useOperationsState();
  const breaker = useCircuitBreakerOperation(state);
  const compensation = useCompensationOperation(state);
  const adjustment = useEntitlementAdjustmentOperation(state);
  const replay = useCallbackReplayOperation(state);
  const reissue = useDeletionTokenReissueOperation(state);

  async function load(): Promise<void> {
    if (!state.allowed.value) {
      state.loading.value = false;
      return;
    }
    state.loading.value = true;
    state.error.value = "";
    try {
      await breaker.load();
      await replay.refresh();
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.loading.value = false;
    }
  }

  onMounted(load);

  return {
    allowed: state.allowed,
    loading: state.loading,
    busy: state.busy,
    error: state.error,
    notice: state.notice,
    breaker: state.breaker,
    breakerDialogOpen: state.breakerDialogOpen,
    compensationDialogOpen: state.compensationDialogOpen,
    compensation: state.compensation,
    adjustmentDialogOpen: state.adjustmentDialogOpen,
    adjustment: state.adjustment,
    replayDialogOpen: state.replayDialogOpen,
    replay: state.replay,
    callbackEvents: state.callbackEvents,
    callbackFilter: state.callbackFilter,
    reissueDialogOpen: state.reissueDialogOpen,
    reissue: state.reissue,
    load,
    refreshCallbacks: replay.refresh,
    toggleBreaker: breaker.toggleBreaker,
    requestCompensation: compensation.request,
    grantCompensation: compensation.submit,
    requestAdjustment: adjustment.request,
    submitAdjustment: adjustment.submit,
    requestReplay: replay.request,
    submitReplay: replay.submit,
    requestReissue: reissue.request,
    submitReissue: reissue.submit,
    fillReplay: replay.fill,
  };
}
