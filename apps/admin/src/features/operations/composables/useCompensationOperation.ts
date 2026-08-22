import { ADMIN_REASON_MIN_LENGTH, COMPENSATION_SECONDS_MIN, ENTITLEMENT_SECONDS_MAX, REWARD_SECONDS } from "@microfocus/contracts";
import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import type { OperationsState } from "./useOperationsState";
import { requireBoundedEntityId } from "./validation";

export function useCompensationOperation(state: OperationsState) {
  function validate(): string {
    const userError = requireBoundedEntityId(state.compensation.userId, "请输入用户 ID", "用户 ID");
    if (userError) return userError;
    const dramaError = requireBoundedEntityId(state.compensation.dramaId, "请输入剧目 ID", "剧目 ID");
    if (dramaError) return dramaError;
    if (!Number.isInteger(state.compensation.seconds) || state.compensation.seconds < COMPENSATION_SECONDS_MIN || state.compensation.seconds > ENTITLEMENT_SECONDS_MAX) {
      return `补偿时长应为 ${COMPENSATION_SECONDS_MIN}–${ENTITLEMENT_SECONDS_MAX} 秒的整数`;
    }
    if (state.compensation.reason.trim().length < ADMIN_REASON_MIN_LENGTH) return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补偿原因`;
    return "";
  }

  function request(): void {
    state.error.value = validate();
    if (!state.error.value) state.compensationDialogOpen.value = true;
  }

  async function submit(): Promise<void> {
    const validation = validate();
    if (validation) {
      state.error.value = validation;
      state.compensationDialogOpen.value = false;
      return;
    }
    state.busy.value = true;
    state.error.value = "";
    try {
      await operationsApi.compensate({ userId: state.compensation.userId.trim(), dramaId: state.compensation.dramaId.trim(), seconds: state.compensation.seconds, reason: state.compensation.reason.trim() });
      state.notice.value = operationsApi.mode === "mock" ? operationActionMessages.mockCompensationGranted : operationActionMessages.compensationGranted;
      Object.assign(state.compensation, { userId: "", dramaId: "", seconds: REWARD_SECONDS, reason: "" });
      state.compensationDialogOpen.value = false;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.busy.value = false;
    }
  }

  return { request, submit };
}
