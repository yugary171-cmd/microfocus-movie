import { toErrorMessage } from "@/infrastructure/api";
import { operationsApi } from "@/features/operations/api";
import { operationActionMessages } from "@/features/operations/constants";
import type { OperationsState } from "./useOperationsState";

export function useCircuitBreakerOperation(state: OperationsState) {
  async function load(): Promise<void> {
    state.breaker.value = await operationsApi.getCircuitBreaker();
  }

  async function toggleBreaker(reason: string): Promise<void> {
    if (!state.breaker.value) return;
    state.busy.value = true;
    state.error.value = "";
    try {
      state.breaker.value = await operationsApi.setCircuitBreaker(!state.breaker.value.enabled, reason);
      state.notice.value = operationsApi.mode === "mock"
        ? operationActionMessages.mockBreakerToggled
        : `播放熔断已${state.breaker.value.enabled ? "开启" : "关闭"}。`;
      state.breakerDialogOpen.value = false;
    } catch (caught) {
      state.error.value = toErrorMessage(caught);
    } finally {
      state.busy.value = false;
    }
  }

  return { load, toggleBreaker };
}
