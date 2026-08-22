import { ADMIN_REASON_MIN_LENGTH } from "@microfocus/contracts";
import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import type { AdminCallbackEvent } from "@/shared/types";
import type { OperationsState } from "./useOperationsState";
import { requireBoundedEntityId } from "./validation";

export function useCallbackReplayOperation(state: OperationsState) {
  async function refresh(): Promise<void> {
    try {
      const callbackList = await operationsApi.listCallbackEvents(state.callbackFilter.value);
      state.callbackEvents.value = Array.isArray(callbackList.items) ? callbackList.items : [];
    } catch (caught) {
      state.callbackEvents.value = [];
      state.error.value = toErrorMessage(caught);
    }
  }

  function validate(): string {
    const eventError = requireBoundedEntityId(state.replay.eventId, "请输入回调事件 ID", "回调事件 ID");
    if (eventError) return eventError;
    if (state.replay.reason.trim().length < ADMIN_REASON_MIN_LENGTH) return `请填写至少 ${ADMIN_REASON_MIN_LENGTH} 个字的重放原因`;
    return "";
  }

  function request(): void {
    state.error.value = validate();
    if (!state.error.value) state.replayDialogOpen.value = true;
  }

  async function submit(): Promise<void> {
    const validation = validate();
    if (validation) {
      state.error.value = validation;
      state.replayDialogOpen.value = false;
      return;
    }
    state.busy.value = true;
    state.error.value = "";
    try {
      await operationsApi.replayCallback({ eventId: state.replay.eventId.trim(), reason: state.replay.reason.trim(), ...(state.replay.approvalNote?.trim() ? { approvalNote: state.replay.approvalNote.trim() } : {}) });
      state.notice.value = operationsApi.mode === "mock" ? operationActionMessages.mockCallbackReplayed : operationActionMessages.callbackReplayed;
      Object.assign(state.replay, { eventId: "", reason: "", approvalNote: "" });
      state.replayDialogOpen.value = false;
      await refresh();
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.busy.value = false;
    }
  }

  function fill(event: AdminCallbackEvent): void {
    state.replay.eventId = event.eventId;
    state.error.value = "";
    state.notice.value = `已填入事件 ${event.eventId}，请补充原因后解锁。`;
  }

  return { refresh, request, submit, fill };
}
