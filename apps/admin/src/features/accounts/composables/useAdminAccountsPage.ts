import {
  ADMIN_LIST_MAX_PAGE,
  ADMIN_WEB_PAGE_SIZE,
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  OTP_INPUT_LENGTH,
  AdminAccountStatus,
  AdminRole,
  AdminSetupPurpose,
  isAdminLoginId,
  isAssignableAdminRole,
  isOwnedContentRole,
  type AssignableAdminRole,
} from "@microfocus/contracts";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { toErrorMessage } from "@/infrastructure/api";
import { accountsApi } from "@/features/accounts/api";
import { accountManagementMessage } from "@/features/accounts/errors";
import { accountActionMessages } from "@/features/accounts/constants";
import { useAuthStore } from "@/infrastructure/stores";
import { useClipboard } from "@/shared/composables/useClipboard";
import { usePaginatedList } from "@/shared/composables/usePaginatedList";
import type { AdminAccountRecord, AdminSetupLink } from "@/shared/types";

type DialogMode = "create" | "edit" | "suspend" | "activate" | "invite" | "reset";

export function useAdminAccountsPage() {
  const auth = useAuthStore();
  const { copy } = useClipboard();
  const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
  const query = ref("");
  const roleFilter = ref<AdminRole | "">("");
  const statusFilter = ref<AdminAccountStatus | "">("");
  const list = usePaginatedList<AdminAccountRecord>({
    initialPageSize: ADMIN_WEB_PAGE_SIZE,
    loadPage: (currentPage, currentPageSize) => allowed.value
      ? accountsApi.listAccounts(query.value, roleFilter.value, statusFilter.value, currentPage, currentPageSize)
      : Promise.resolve({ items: [], total: 0 }),
    getErrorMessage: (caught) => accountManagementMessage(caught) || toErrorMessage(caught),
  });
  const { items, total, page, pageSize, loading, error } = list;
  const busy = ref(false);
  const notice = ref("");
  const dialogMode = ref<DialogMode | null>(null);
  const selected = ref<AdminAccountRecord | null>(null);
  const activeEditors = ref<AdminAccountRecord[]>([]);
  const setupLink = ref<AdminSetupLink | null>(null);
  const setupLinkOwner = ref("");
  const copied = ref(false);
  const copiedLoginId = ref("");
  let copiedLoginTimer = 0;
  const actionMenuAccount = ref<AdminAccountRecord | null>(null);
  const actionMenuStyle = ref<{ top: string; right: string }>({ top: "0px", right: "0px" });
  const form = reactive({
    displayName: "",
    email: "",
    role: AdminRole.EDITOR as AssignableAdminRole,
    otp: "",
    reason: "",
    replacementEditorId: "",
  });

  const isSelf = computed(() => selected.value?.id === auth.user?.id);
  const needsReplacement = computed(() => {
    const account = selected.value;
    if (!account || !isOwnedContentRole(account.role) || account.ownedDramaCount < 1) return false;
    if (dialogMode.value === "suspend" || dialogMode.value === "reset") return true;
    return dialogMode.value === "edit" && !isOwnedContentRole(form.role);
  });
  const dialogTitle = computed(() => ({
    create: "新增管理员账号",
    edit: "编辑账号资料与角色",
    suspend: "停用管理员账号",
    activate: "启用管理员账号",
    invite: "重发开通链接",
    reset: "重置登录凭据",
  }[dialogMode.value ?? "create"]));

  function resetForm(): void {
    Object.assign(form, {
      displayName: "",
      email: "",
      role: AdminRole.EDITOR as AssignableAdminRole,
      otp: "",
      reason: "",
      replacementEditorId: "",
    });
  }

  async function load(): Promise<void> {
    if (!allowed.value) {
      loading.value = false;
      return;
    }
    await list.load();
  }

  async function loadEditors(): Promise<void> {
    try {
      const editors: AdminAccountRecord[] = [];
      for (let editorPage = 1; editorPage <= ADMIN_LIST_MAX_PAGE; editorPage += 1) {
        const result = await accountsApi.listAccounts("", AdminRole.EDITOR, AdminAccountStatus.ACTIVE, editorPage);
        editors.push(...result.items);
        if (result.items.length === 0 || editors.length >= result.total) break;
      }
      activeEditors.value = editors.filter((item) => item.id !== selected.value?.id);
    } catch {
      activeEditors.value = [];
    }
  }

  function closeActions(): void {
    actionMenuAccount.value = null;
  }

  function filter(): void {
    list.resetPage();
    closeActions();
    void load();
  }

  function resetFilters(): void {
    query.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    list.resetPage();
    closeActions();
    void load();
  }

  function go(next: number): void {
    list.go(next);
    closeActions();
  }

  function changePageSize(next: number): void {
    list.changePageSize(next);
    closeActions();
  }

  function toggleActions(account: AdminAccountRecord, event: MouseEvent): void {
    event.stopPropagation();
    if (actionMenuAccount.value?.id === account.id) {
      closeActions();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    actionMenuAccount.value = account;
    actionMenuStyle.value = {
      top: `${Math.round(rect.bottom + 4)}px`,
      right: `${Math.round(window.innerWidth - rect.right)}px`,
    };
  }

  function openDialog(mode: DialogMode, account?: AdminAccountRecord): void {
    closeActions();
    resetForm();
    error.value = "";
    selected.value = account ?? null;
    dialogMode.value = mode;
    if (account) {
      form.displayName = account.displayName;
      form.email = account.email;
      form.role = isAssignableAdminRole(account.role) ? account.role : AdminRole.EDITOR;
      if (isOwnedContentRole(account.role) && account.ownedDramaCount > 0) void loadEditors();
    }
  }

  function closeDialog(): void {
    if (busy.value) return;
    dialogMode.value = null;
    selected.value = null;
    resetForm();
  }

  function formError(): string {
    if (dialogMode.value === "create" || dialogMode.value === "edit") {
      if (!form.displayName.trim()) return "请输入真实姓名";
    }
    if (dialogMode.value === "create" && !isAdminLoginId(form.email)) {
      return "请输入登录名，例如 name 或 name@company.com";
    }
    if (!new RegExp(`^\\d{${OTP_INPUT_LENGTH}}$`).test(form.otp)) {
      return `请输入当前管理员的 ${OTP_INPUT_LENGTH} 位验证码`;
    }
    if (["create", "edit", "suspend", "activate", "invite", "reset"].includes(dialogMode.value ?? "")) {
      const length = form.reason.trim().length;
      if (length < ADMIN_REASON_MIN_LENGTH || length > ADMIN_REASON_MAX_LENGTH) {
        return `操作原因应为 ${ADMIN_REASON_MIN_LENGTH}–${ADMIN_REASON_MAX_LENGTH} 个字符`;
      }
    }
    if (needsReplacement.value && !form.replacementEditorId) return "请选择接替内容编辑";
    if (isSelf.value && ["suspend", "reset"].includes(dialogMode.value ?? "")) return "不能对自己的账号执行此操作";
    if (isSelf.value && dialogMode.value === "edit" && form.role !== selected.value?.role) return "不能修改自己的角色";
    return "";
  }

  async function submit(): Promise<void> {
    const validation = formError();
    if (validation) {
      error.value = validation;
      return;
    }
    busy.value = true;
    error.value = "";
    try {
      if (dialogMode.value === "create") {
        const result = await accountsApi.createAccount({
          displayName: form.displayName.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          otp: form.otp,
          reason: form.reason.trim(),
        });
        setupLink.value = result;
        setupLinkOwner.value = form.displayName.trim();
        notice.value = accountActionMessages.created;
      } else if (selected.value && dialogMode.value === "edit") {
        await accountsApi.updateAccount(selected.value.id, {
          displayName: form.displayName.trim(),
          ...(form.role !== selected.value.role ? { role: form.role } : {}),
          ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
          otp: form.otp,
          reason: form.reason.trim(),
        });
        notice.value = accountActionMessages.updated;
      } else if (selected.value && dialogMode.value === "suspend") {
        await accountsApi.suspendAccount(selected.value.id, {
          reason: form.reason.trim(),
          ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
          otp: form.otp,
        });
        notice.value = accountActionMessages.suspended;
      } else if (selected.value && dialogMode.value === "activate") {
        await accountsApi.activateAccount(selected.value.id, { reason: form.reason.trim(), otp: form.otp });
        notice.value = accountActionMessages.activated;
      } else if (selected.value && (dialogMode.value === "invite" || dialogMode.value === "reset")) {
        const purpose = dialogMode.value === "invite" ? AdminSetupPurpose.INVITE : AdminSetupPurpose.CREDENTIAL_RESET;
        setupLink.value = await accountsApi.createAccountSetupLink(selected.value.id, {
          purpose,
          reason: form.reason.trim(),
          ...(needsReplacement.value ? { transferEditorId: form.replacementEditorId } : {}),
          otp: form.otp,
        });
        setupLinkOwner.value = selected.value.displayName;
        notice.value = purpose === AdminSetupPurpose.INVITE
          ? accountActionMessages.setupLinkCreated
          : accountActionMessages.resetCompleted;
      }
      dialogMode.value = null;
      selected.value = null;
      resetForm();
      await load();
    } catch (caught) {
      error.value = accountManagementMessage(caught) || toErrorMessage(caught);
    } finally {
      busy.value = false;
    }
  }

  async function copyLoginId(loginId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await copy(loginId);
      copiedLoginId.value = loginId;
      window.clearTimeout(copiedLoginTimer);
      copiedLoginTimer = window.setTimeout(() => {
        if (copiedLoginId.value === loginId) copiedLoginId.value = "";
      }, 1500);
    } catch {
      error.value = accountActionMessages.copyLoginFailed;
    }
  }

  async function copySetupLink(): Promise<void> {
    if (!setupLink.value) return;
    try {
      await copy(setupLink.value.setupUrl);
      copied.value = true;
    } catch {
      error.value = accountActionMessages.copyLinkFailed;
    }
  }

  function closeSetupLink(): void {
    setupLink.value = null;
    setupLinkOwner.value = "";
    copied.value = false;
  }

  function onDocumentPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      closeActions();
      return;
    }
    if (target.closest(".account-actions-menu") || target.closest(".account-actions-trigger")) return;
    closeActions();
  }

  onMounted(() => {
    void load();
    window.addEventListener("resize", closeActions);
    window.addEventListener("scroll", closeActions, true);
    document.addEventListener("pointerdown", onDocumentPointerDown);
  });
  onBeforeUnmount(() => {
    window.clearTimeout(copiedLoginTimer);
    window.removeEventListener("resize", closeActions);
    window.removeEventListener("scroll", closeActions, true);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
  });

  return {
    auth,
    allowed,
    query,
    roleFilter,
    statusFilter,
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    busy,
    notice,
    dialogMode,
    selected,
    activeEditors,
    setupLink,
    setupLinkOwner,
    copied,
    copiedLoginId,
    actionMenuAccount,
    actionMenuStyle,
    form,
    needsReplacement,
    dialogTitle,
    load,
    filter,
    resetFilters,
    go,
    changePageSize,
    toggleActions,
    openDialog,
    closeDialog,
    submit,
    copyLoginId,
    copySetupLink,
    closeSetupLink,
  };
}
