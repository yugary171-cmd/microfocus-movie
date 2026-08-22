import { ADMIN_REASON_MIN_LENGTH, COMPENSATION_SECONDS_MIN, ENTITLEMENT_SECONDS_MAX } from "@microfocus/contracts";
import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import type { OperationsState } from "./useOperationsState";
import { requireBoundedEntityId } from "./validation";

export function useEntitlementAdjustmentOperation(state: OperationsState) {
  function validate(): string {
    const grantError = requireBoundedEntityId(state.adjustment.grantId, "请输入 grant ID", "grant ID");
    if (grantError) return grantError;
    if (!Number.isInteger(state.adjustment.seconds) || state.adjustment.seconds < 1 || state.adjustment.seconds > ENTITLEMENT_SECONDS_MAX) return `纠错秒数应为 1–${ENTITLEMENT_SECONDS_MAX} 的整数`;
    if (state.adjustment.reason.trim().length < ADMIN_REASON_MIN_LENGTH) return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的纠错原因`;
    if (state.adjustment.type === "RELEASE_FREEZE") return requireBoundedEntityId(state.adjustment.freezeAdjustmentId ?? "", "释放冻结必须填写原冻结记录 ID", "原冻结记录 ID");
    return "";
  }

  function request(): void {
    state.error.value = validate();
    if (!state.error.value) state.adjustmentDialogOpen.value = true;
  }

  async function submit(): Promise<void> {
    const validation = validate();
    if (validation) {
      state.error.value = validation;
      state.adjustmentDialogOpen.value = false;
      return;
    }
    state.busy.value = true;
    state.error.value = "";
    try {
      await operationsApi.adjustEntitlement({
        type: state.adjustment.type,
        grantId: state.adjustment.grantId.trim(),
        seconds: state.adjustment.seconds,
        reason: state.adjustment.reason.trim(),
        ...(state.adjustment.type === "RELEASE_FREEZE" && state.adjustment.freezeAdjustmentId?.trim() ? { freezeAdjustmentId: state.adjustment.freezeAdjustmentId.trim() } : {}),
        ...(state.adjustment.approvalNote?.trim() ? { approvalNote: state.adjustment.approvalNote.trim() } : {}),
      });
      state.notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockAdjustmentRecorded
        : state.adjustment.type === "WRITE_OFF" ? operationActionMessages.adjustmentVoided : operationActionMessages.adjustmentRecorded;
      Object.assign(state.adjustment, { type: "FREEZE_REMAINDER", grantId: "", seconds: COMPENSATION_SECONDS_MIN, reason: "", freezeAdjustmentId: "", approvalNote: "" });
      state.adjustmentDialogOpen.value = false;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.busy.value = false;
    }
  }

  return { request, submit };
}
