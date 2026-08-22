import {
  ADMIN_REASON_MIN_LENGTH,
  AdminRole,
  COMPENSATION_SECONDS_MIN,
  ENTITY_ID_MAX_LENGTH,
  ENTITLEMENT_SECONDS_MAX,
  REWARD_SECONDS,
} from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import { useAuthStore } from "@/infrastructure/stores";
import type {
  AdminCallbackEvent,
  AdjustmentInput,
  CallbackReplayInput,
  CircuitBreakerState,
  CompensationInput,
  DeletionQueryTokenReissueInput,
} from "@/shared/types";

export function useOperationsPage() {
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
  const adjustment = reactive<AdjustmentInput>({
    type: "FREEZE_REMAINDER",
    grantId: "",
    seconds: COMPENSATION_SECONDS_MIN,
    reason: "",
    freezeAdjustmentId: "",
    approvalNote: "",
  });
  const replayDialogOpen = ref(false);
  const replay = reactive<CallbackReplayInput>({ eventId: "", reason: "", approvalNote: "" });
  const callbackEvents = ref<AdminCallbackEvent[]>([]);
  const callbackFilter = ref("BACKLOG");
  const reissueDialogOpen = ref(false);
  const reissue = reactive<DeletionQueryTokenReissueInput>({
    deletionRequestId: "",
    userId: "",
    reason: "",
    approvalNote: "",
  });

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      breaker.value = await operationsApi.getCircuitBreaker();
      await refreshCallbacks();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  async function refreshCallbacks(): Promise<void> {
    try {
      const callbackList = await operationsApi.listCallbackEvents(callbackFilter.value);
      callbackEvents.value = Array.isArray(callbackList.items) ? callbackList.items : [];
    } catch (caught) {
      callbackEvents.value = [];
      error.value = toErrorMessage(caught);
    }
  }

  async function toggleBreaker(reason: string): Promise<void> {
    if (!breaker.value) return;
    busy.value = true;
    error.value = "";
    try {
      breaker.value = await operationsApi.setCircuitBreaker(!breaker.value.enabled, reason);
      notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockBreakerToggled
        : `播放熔断已${breaker.value.enabled ? "开启" : "关闭"}。`;
      breakerDialogOpen.value = false;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function requireBoundedEntityId(value: string, emptyMessage: string, label: string): string {
    const id = value.trim();
    if (!id) return emptyMessage;
    if (id.length > ENTITY_ID_MAX_LENGTH) return `${label}最长 ${ENTITY_ID_MAX_LENGTH} 个字符`;
    return "";
  }

  function validateCompensation(): string {
    const userError = requireBoundedEntityId(compensation.userId, "请输入用户 ID", "用户 ID");
    if (userError) return userError;
    const dramaError = requireBoundedEntityId(compensation.dramaId, "请输入剧目 ID", "剧目 ID");
    if (dramaError) return dramaError;
    if (
      !Number.isInteger(compensation.seconds) ||
      compensation.seconds < COMPENSATION_SECONDS_MIN ||
      compensation.seconds > ENTITLEMENT_SECONDS_MAX
    ) {
      return `补偿时长应为 ${COMPENSATION_SECONDS_MIN}–${ENTITLEMENT_SECONDS_MAX} 秒的整数`;
    }
    if (compensation.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
      return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补偿原因`;
    }
    return "";
  }

  function requestCompensation(): void {
    error.value = validateCompensation();
    if (!error.value) compensationDialogOpen.value = true;
  }

  async function grantCompensation(): Promise<void> {
    const validation = validateCompensation();
    if (validation) {
      error.value = validation;
      compensationDialogOpen.value = false;
      return;
    }
    busy.value = true;
    error.value = "";
    try {
      await operationsApi.compensate({
        userId: compensation.userId.trim(),
        dramaId: compensation.dramaId.trim(),
        seconds: compensation.seconds,
        reason: compensation.reason.trim(),
      });
      notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockCompensationGranted
        : operationActionMessages.compensationGranted;
      Object.assign(compensation, { userId: "", dramaId: "", seconds: REWARD_SECONDS, reason: "" });
      compensationDialogOpen.value = false;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function validateAdjustment(): string {
    const grantError = requireBoundedEntityId(adjustment.grantId, "请输入 grant ID", "grant ID");
    if (grantError) return grantError;
    if (
      !Number.isInteger(adjustment.seconds) ||
      adjustment.seconds < 1 ||
      adjustment.seconds > ENTITLEMENT_SECONDS_MAX
    ) {
      return `纠错秒数应为 1–${ENTITLEMENT_SECONDS_MAX} 的整数`;
    }
    if (adjustment.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
      return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的纠错原因`;
    }
    if (adjustment.type === "RELEASE_FREEZE") {
      return requireBoundedEntityId(
        adjustment.freezeAdjustmentId ?? "",
        "释放冻结必须填写原冻结记录 ID",
        "原冻结记录 ID",
      );
    }
    return "";
  }

  function requestAdjustment(): void {
    error.value = validateAdjustment();
    if (!error.value) adjustmentDialogOpen.value = true;
  }

  async function submitAdjustment(): Promise<void> {
    const validation = validateAdjustment();
    if (validation) {
      error.value = validation;
      adjustmentDialogOpen.value = false;
      return;
    }
    busy.value = true;
    error.value = "";
    try {
      await operationsApi.adjustEntitlement({
        type: adjustment.type,
        grantId: adjustment.grantId.trim(),
        seconds: adjustment.seconds,
        reason: adjustment.reason.trim(),
        ...(adjustment.type === "RELEASE_FREEZE" && adjustment.freezeAdjustmentId?.trim()
          ? { freezeAdjustmentId: adjustment.freezeAdjustmentId.trim() }
          : {}),
        ...(adjustment.approvalNote?.trim() ? { approvalNote: adjustment.approvalNote.trim() } : {}),
      });
      notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockAdjustmentRecorded
        : adjustment.type === "WRITE_OFF"
          ? operationActionMessages.adjustmentVoided
          : operationActionMessages.adjustmentRecorded;
      Object.assign(adjustment, {
        type: "FREEZE_REMAINDER",
        grantId: "",
        seconds: COMPENSATION_SECONDS_MIN,
        reason: "",
        freezeAdjustmentId: "",
        approvalNote: "",
      });
      adjustmentDialogOpen.value = false;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function validateReplay(): string {
    const eventError = requireBoundedEntityId(replay.eventId, "请输入回调事件 ID", "回调事件 ID");
    if (eventError) return eventError;
    if (replay.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
      return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的重放原因`;
    }
    return "";
  }

  function requestReplay(): void {
    error.value = validateReplay();
    if (!error.value) replayDialogOpen.value = true;
  }

  async function submitReplay(): Promise<void> {
    const validation = validateReplay();
    if (validation) {
      error.value = validation;
      replayDialogOpen.value = false;
      return;
    }
    busy.value = true;
    error.value = "";
    try {
      await operationsApi.replayCallback({
        eventId: replay.eventId.trim(),
        reason: replay.reason.trim(),
        ...(replay.approvalNote?.trim() ? { approvalNote: replay.approvalNote.trim() } : {}),
      });
      notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockCallbackReplayed
        : operationActionMessages.callbackReplayed;
      Object.assign(replay, { eventId: "", reason: "", approvalNote: "" });
      replayDialogOpen.value = false;
      await refreshCallbacks();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function validateReissue(): string {
    const requestError = requireBoundedEntityId(
      reissue.deletionRequestId,
      "请输入注销申请 ID",
      "注销申请 ID",
    );
    if (requestError) return requestError;
    const userError = requireBoundedEntityId(reissue.userId, "请输入已核验的用户 ID", "已核验用户 ID");
    if (userError) return userError;
    if (reissue.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
      return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补发原因`;
    }
    if (reissue.approvalNote.trim().length < ADMIN_REASON_MIN_LENGTH) {
      return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的审批/核验记录`;
    }
    return "";
  }

  function requestReissue(): void {
    error.value = validateReissue();
    if (!error.value) reissueDialogOpen.value = true;
  }

  async function submitReissue(): Promise<void> {
    const validation = validateReissue();
    if (validation) {
      error.value = validation;
      reissueDialogOpen.value = false;
      return;
    }
    busy.value = true;
    error.value = "";
    try {
      const result = await operationsApi.reissueDeletionQueryToken({
        deletionRequestId: reissue.deletionRequestId.trim(),
        userId: reissue.userId.trim(),
        reason: reissue.reason.trim(),
        approvalNote: reissue.approvalNote.trim(),
      });
      if (operationsApi.mode === "mock") {
        notice.value = operationActionMessages.mockDeletionTokenReissued;
      } else if (result.deletionQueryToken) {
        notice.value = `查询令牌已补发（只显示一次）：${result.deletionQueryToken}`;
      } else {
        notice.value = operationActionMessages.deletionTokenAlreadyProcessed;
      }
      Object.assign(reissue, { deletionRequestId: "", userId: "", reason: "", approvalNote: "" });
      reissueDialogOpen.value = false;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  function fillReplay(event: AdminCallbackEvent): void {
    replay.eventId = event.eventId;
    error.value = "";
    notice.value = `已填入事件 ${event.eventId}，请补充原因后解锁。`;
  }

  onMounted(load);

  return {
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
    load,
    refreshCallbacks,
    toggleBreaker,
    requestCompensation,
    grantCompensation,
    requestAdjustment,
    submitAdjustment,
    requestReplay,
    submitReplay,
    requestReissue,
    submitReissue,
    fillReplay,
  };
}
