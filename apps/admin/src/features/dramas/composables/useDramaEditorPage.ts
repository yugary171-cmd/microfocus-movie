import { onMounted, onUnmounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useDramaEditorActions } from "./useDramaEditorActions";
import { useDramaEditorData } from "./useDramaEditorData";
import { useDramaEditorState } from "./useDramaEditorState";
import { useDramaEditorUploads } from "./useDramaEditorUploads";

export function useDramaEditorPage() {
  const state = useDramaEditorState();
  const data = useDramaEditorData(state);
  const uploads = useDramaEditorUploads(state);
  const actions = useDramaEditorActions(state, data);

  onBeforeRouteLeave(() => {
    if (!state.dirty.value) return true;
    return window.confirm("当前有未保存修改，确定离开吗？");
  });
  onMounted(data.load);
  onUnmounted(uploads.dispose);

  return {
    auth: state.auth,
    id: state.id,
    isNew: state.isNew,
    loading: state.loading,
    saving: state.saving,
    actionBusy: state.actionBusy,
    error: state.error,
    notice: state.notice,
    dirty: state.dirty,
    drama: state.drama,
    gate: state.gate,
    dialog: state.dialog,
    form: state.form,
    tagPickerOpen: state.tagPickerOpen,
    tagGroups: state.tagGroups,
    selectedDramaType: state.selectedDramaType,
    rightsFilled: state.rightsFilled,
    uploadCapabilities: state.uploadCapabilities,
    canEdit: state.canEdit,
    readonlyReason: state.readonlyReason,
    selectedTagChips: state.selectedTagChips,
    choosePoster: uploads.choosePoster,
    clearPoster: uploads.clearPoster,
    applySelectedTags: state.applySelectedTags,
    inputChanged: state.inputChanged,
    updateEpisodes: state.updateEpisodes,
    load: data.load,
    save: actions.save,
    submitReview: actions.submitReview,
    confirmAction: actions.confirmAction,
  };
}
