import { onMounted, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { dashboardApi } from "@/features/dashboard/api";
import type { DashboardData } from "@/shared/types";

export function useDashboardPage() {
  const data = ref<DashboardData | null>(null);
  const loading = ref(true);
  const error = ref("");

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      data.value = await dashboardApi.dashboard();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return {
    data,
    loading,
    error,
    load,
  };
}
