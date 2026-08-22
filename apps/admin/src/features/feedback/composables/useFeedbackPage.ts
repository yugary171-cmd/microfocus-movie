import { AdminRole, UserFeedbackStatus } from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { feedbackApi } from "@/features/feedback/api";
import { useAuthStore } from "@/infrastructure/stores";
import type { AdminFeedbackRecord, FeedbackStatus } from "@/shared/types";

export function useFeedbackPage() {
  const auth = useAuthStore();
  const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
  const items = ref<AdminFeedbackRecord[]>([]);
  const selected = ref<AdminFeedbackRecord | null>(null);
  const loading = ref(true);
  const busy = ref(false);
  const error = ref("");
  const query = ref("");
  const status = ref("");
  const form = reactive({
    internalNote: "",
    reply: "",
    status: UserFeedbackStatus.NEW as FeedbackStatus,
  });

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      items.value = (await feedbackApi.listFeedback(query.value, status.value, 1)).items;
      if (selected.value) await select(selected.value.id);
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      loading.value = false;
    }
  }

  async function select(id: string): Promise<void> {
    try {
      selected.value = await feedbackApi.getFeedback(id);
      form.internalNote = selected.value.internalNote ?? "";
      form.status = selected.value.status as FeedbackStatus;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    }
  }

  async function save(): Promise<void> {
    if (!selected.value) return;
    busy.value = true;
    try {
      selected.value = await feedbackApi.updateFeedback(selected.value.id, {
        status: form.status,
        internalNote: form.internalNote,
      });
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  async function reply(): Promise<void> {
    if (!selected.value || !form.reply.trim()) return;
    busy.value = true;
    try {
      await feedbackApi.replyFeedback(selected.value.id, form.reply.trim());
      form.reply = "";
      await select(selected.value.id);
      await load();
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  onMounted(() => void load());

  return {
    allowed,
    items,
    selected,
    loading,
    busy,
    error,
    query,
    status,
    form,
    load,
    select,
    save,
    reply,
  };
}
