import { ADMIN_REASON_MIN_LENGTH } from "@microfocus/contracts";
import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import type { OperationsState } from "./useOperationsState";
import { requireBoundedEntityId } from "./validation";

export function useDeletionTokenReissueOperation(state: OperationsState) {
  function validate(): string {
    const requestError = requireBoundedEntityId(state.reissue.deletionRequestId, "请输入注销申请 ID", "注销申请 ID");
    if (requestError) return requestError;
    const userError = requireBoundedEntityId(state.reissue.userId, "请输入已核验的用户 ID", "已核验用户 ID");
    if (userError) return userError;
    if (state.reissue.reason.trim().length < ADMIN_REASON_MIN_LENGTH) return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的补发原因`;
    if (state.reissue.approvalNote.trim().length < ADMIN_REASON_MIN_LENGTH) return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的审批/核验记录`;
    return "";
  }

  function request(): void {
    state.error.value = validate();
    if (!state.error.value) state.reissueDialogOpen.value = true;
  }

  async function submit(): Promise<void> {
    const validation = validate();
    if (validation) {
      state.error.value = validation;
      state.reissueDialogOpen.value = false;
      return;
    }
    state.busy.value = true;
    state.error.value = "";
    try {
      const result = await operationsApi.reissueDeletionQueryToken({ deletionRequestId: state.reissue.deletionRequestId.trim(), userId: state.reissue.userId.trim(), reason: state.reissue.reason.trim(), approvalNote: state.reissue.approvalNote.trim() });
      if (operationsApi.mode === "mock") state.notice.value = operationActionMessages.mockDeletionTokenReissued;
      else if (result.deletionQueryToken) state.notice.value = `查询令牌已补发（只显示一次）：${result.deletionQueryToken}`;
      else state.notice.value = operationActionMessages.deletionTokenAlreadyProcessed;
      Object.assign(state.reissue, { deletionRequestId: "", userId: "", reason: "", approvalNote: "" });
      state.reissueDialogOpen.value = false;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.busy.value = false;
    }
  }

  return { request, submit };
}
