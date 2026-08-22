import { AdminRole, COMPENSATION_SECONDS_MIN, REWARD_SECONDS } from "@microfocus/contracts";
import { computed, reactive, ref } from "vue";
import { useAuthStore } from "@/infrastructure/stores";
import type { AdminCallbackEvent, AdjustmentInput, CallbackReplayInput, CircuitBreakerState, CompensationInput, DeletionQueryTokenReissueInput } from "@/shared/types";

export function useOperationsState() {
  const auth = useAuthStore();
  const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
  const loading = ref(true);
  const busy = ref(false);
  const error = ref("");
  const notice = ref("");
  const breaker = ref<CircuitBreakerState | null>(null);
  const breakerDialogOpen = ref(false);
  const compensationDialogOpen = ref(false);
  const compensation = reactive<CompensationInput>({ userId: "", dramaId: "", seconds: REWARD_SECONDS, reason: "" });
  const adjustmentDialogOpen = ref(false);
  const adjustment = reactive<AdjustmentInput>({ type: "FREEZE_REMAINDER", grantId: "", seconds: COMPENSATION_SECONDS_MIN, reason: "", freezeAdjustmentId: "", approvalNote: "" });
  const replayDialogOpen = ref(false);
  const replay = reactive<CallbackReplayInput>({ eventId: "", reason: "", approvalNote: "" });
  const callbackEvents = ref<AdminCallbackEvent[]>([]);
  const callbackFilter = ref("BACKLOG");
  const reissueDialogOpen = ref(false);
  const reissue = reactive<DeletionQueryTokenReissueInput>({ deletionRequestId: "", userId: "", reason: "", approvalNote: "" });

  return {
    auth,
    allowed,
    loading,
    busy,
    error,
    notice,
    breaker,
    breakerDialogOpen,
    compensationDialogOpen,
    compensation,
    adjustmentDialogOpen,
    adjustment,
    replayDialogOpen,
    replay,
    callbackEvents,
    callbackFilter,
    reissueDialogOpen,
    reissue,
  };
}

export type OperationsState = ReturnType<typeof useOperationsState>;
