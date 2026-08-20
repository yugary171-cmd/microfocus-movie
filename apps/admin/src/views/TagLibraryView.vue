<script setup lang="ts">
import {
  AdminRole,
  CATALOG_TAG_GROUPS,
  CatalogTagStatus,
  DRAMA_TAG_MAX_LENGTH,
  isCatalogTagGroupId,
  type CatalogTag,
  type CatalogTagGroupId,
} from "@microfocus/contracts";
import { computed, onMounted, reactive, ref } from "vue";
import { adminApi } from "@/api/admin";
import { toErrorMessage } from "@/api/client";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import PageState from "@/components/PageState.vue";
import Icon from "@/components/Icon.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const allowed = computed(() => auth.user?.role === AdminRole.ADMIN);
const items = ref<CatalogTag[]>([]);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const createOpen = ref(false);
const pending = ref<CatalogTag | null>(null);
const inspecting = ref<CatalogTag | null>(null);
const inspectAction = ref<"delete" | "archive">("archive");
const replacementTagId = ref("");
const form = reactive({
  group: "subjects" as CatalogTagGroupId,
  name: "",
});

const grouped = computed(() =>
  CATALOG_TAG_GROUPS.map((group) => {
    const tags = items.value.filter((tag) => tag.group === group.id);
    const activeCount = tags.filter((tag) => tag.status === CatalogTagStatus.ACTIVE).length;
    const archivedCount = tags.length - activeCount;
    return {
      ...group,
      tags,
      activeCount,
      archivedCount,
    };
  }),
);

async function load(): Promise<void> {
  if (!allowed.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await adminApi.listCatalogTags(true);
    items.value = Array.isArray(result.items) ? result.items : [];
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function createTag(): Promise<void> {
  if (!isCatalogTagGroupId(form.group)) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await adminApi.createCatalogTag(form.group, form.name);
    form.name = "";
    createOpen.value = false;
    notice.value = "已新增启用标签。";
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function confirmStatus(): Promise<void> {
  const tag = pending.value;
  if (!tag) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const next =
      tag.status === CatalogTagStatus.ACTIVE ? CatalogTagStatus.ARCHIVED : CatalogTagStatus.ACTIVE;
    await adminApi.patchCatalogTag(tag.id, next);
    pending.value = null;
    notice.value = next === CatalogTagStatus.ARCHIVED ? "已停用，已有剧目标签不会改写。" : "已重新启用。";
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

const inUse = computed(() => (inspecting.value?.usageCount ?? 0) > 0);
const canArchive = computed(() => inspecting.value?.status === CatalogTagStatus.ACTIVE);
const replacementOptions = computed(() => {
  const target = inspecting.value;
  if (!target) return [];
  return items.value.filter(
    (tag) =>
      tag.group === target.group &&
      tag.id !== target.id &&
      tag.status === CatalogTagStatus.ACTIVE,
  );
});
const inspectConfirmDisabled = computed(() => {
  if (busy.value || !inspecting.value) return true;
  if (inspectAction.value === "archive") return !canArchive.value;
  return inUse.value && !replacementTagId.value;
});

function chipLabel(tag: CatalogTag): string {
  return tag.status === CatalogTagStatus.ARCHIVED ? `启用「${tag.name}」` : tag.name;
}

async function inspectTag(tag: CatalogTag): Promise<void> {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const detail = await adminApi.getCatalogTag(tag.id);
    inspecting.value = {
      ...detail,
      usageCount: Math.max(0, detail.usageCount ?? 0),
    };
    replacementTagId.value = "";
    inspectAction.value =
      detail.status === CatalogTagStatus.ACTIVE ? "archive" : "delete";
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function closeInspect(): void {
  inspecting.value = null;
  replacementTagId.value = "";
  inspectAction.value = "archive";
}

async function confirmInspect(): Promise<void> {
  const tag = inspecting.value;
  if (!tag || inspectConfirmDisabled.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (inspectAction.value === "archive") {
      await adminApi.patchCatalogTag(tag.id, CatalogTagStatus.ARCHIVED);
      closeInspect();
      notice.value = "已停用，已有剧目标签不会改写。";
    } else {
      const used = (tag.usageCount ?? 0) > 0;
      await adminApi.deleteCatalogTag(tag.id, used ? replacementTagId.value : undefined);
      closeInspect();
      notice.value = used ? "已替换引用并删除标签。" : "已删除标签。";
    }
    await load();
  } catch (caught) {
    error.value = toErrorMessage(caught);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <p class="eyebrow">TAG LIBRARY</p>
        <h1>标签库</h1>
        <p>维护启用词，可停用或删除。人物、风格、受众不出现在观看端卡片。</p>
      </div>
      <div v-if="allowed" class="page-header__actions">
        <button class="button button--primary" type="button" @click="createOpen = true">新增标签</button>
      </div>
    </header>
    <PageState v-if="!allowed" type="forbidden" message="只有系统管理员可以维护标签库。" />
    <section v-else class="panel">
      <p v-if="notice" class="tag-library__notice">{{ notice }}</p>
      <PageState v-if="loading" type="loading" message="正在读取标签库…" />
      <PageState v-else-if="error" type="error" :message="error" @retry="load" />
      <div v-else class="tag-library__groups">
        <article v-for="group in grouped" :key="group.id" class="tag-library__group">
          <div class="tag-library__heading">
            <h2>{{ group.label }}</h2>
            <p v-if="group.tags.length">
              {{ group.activeCount }} 启用
              <template v-if="group.archivedCount"> / {{ group.archivedCount }} 停用</template>
            </p>
          </div>
          <p v-if="!group.tags.length" class="tag-library__empty">本组暂无标签</p>
          <div v-else class="tag-picker__chips">
            <span
              v-for="tag in group.tags"
              :key="tag.id"
              class="tag-chip-wrap"
            >
              <button
                class="tag-chip"
                type="button"
                :class="{
                  'tag-chip--active': tag.status === CatalogTagStatus.ACTIVE,
                  'tag-chip--archived': tag.status === CatalogTagStatus.ARCHIVED,
                }"
                :disabled="busy"
                :aria-pressed="tag.status === CatalogTagStatus.ACTIVE"
                :aria-label="chipLabel(tag)"
                @click="tag.status === CatalogTagStatus.ARCHIVED ? (pending = tag) : undefined"
              >
                {{ tag.name }}
              </button>
              <button
                class="tag-chip__remove"
                type="button"
                :disabled="busy"
                :aria-label="`处理「${tag.name}」`"
                @click.stop="inspectTag(tag)"
              >
                <Icon name="close" :size="12" />
              </button>
            </span>
          </div>
        </article>
      </div>
    </section>
    <div v-if="createOpen" class="dialog-backdrop" @keydown.esc="createOpen = false">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="create-tag-title">
        <h2 id="create-tag-title">新增标签</h2>
        <p>名称在同一分组内不可重复。不能改名；删除前若仍有剧目引用，必须替换成同组其他启用词。</p>
        <label class="field">
          <span>分组</span>
          <select v-model="form.group">
            <option v-for="group in CATALOG_TAG_GROUPS" :key="group.id" :value="group.id">{{ group.label }}</option>
          </select>
        </label>
        <label class="field">
          <span>名称</span>
          <input v-model="form.name" type="text" :maxlength="DRAMA_TAG_MAX_LENGTH" placeholder="例如：赛博" />
        </label>
        <div class="dialog__actions">
          <button class="button button--ghost" type="button" :disabled="busy" @click="createOpen = false">取消</button>
          <button class="button button--primary" type="button" :disabled="busy || !form.name.trim()" @click="createTag">保存</button>
        </div>
      </section>
    </div>
    <ConfirmDialog
      :open="Boolean(pending)"
      :title="pending?.status === CatalogTagStatus.ACTIVE ? '停用标签' : '启用标签'"
      :message="
        pending?.status === CatalogTagStatus.ACTIVE
          ? `停用「${pending?.name ?? ''}」后，编辑不能再勾选它，已保存在剧上的标签不会自动删除。`
          : `重新启用「${pending?.name ?? ''}」后，编辑可以再次勾选。`
      "
      :tone="pending?.status === CatalogTagStatus.ACTIVE ? 'danger' : 'primary'"
      :busy="busy"
      :confirm-label="pending?.status === CatalogTagStatus.ACTIVE ? '停用' : '启用'"
      @close="pending = null"
      @confirm="confirmStatus"
    />
    <div v-if="inspecting" class="dialog-backdrop" @keydown.esc="closeInspect">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="inspect-tag-title">
        <h2 id="inspect-tag-title">{{ inUse ? "标签使用中" : "处理标签" }}</h2>
        <p v-if="inUse">
          「{{ inspecting.name }}」正在被 {{ inspecting.usageCount }} 部剧使用。建议先替换再删除，或先停用（已有剧上的标签不会改写）。
        </p>
        <p v-else>
          「{{ inspecting.name }}」当前没有剧目使用。可以选择删除，{{ canArchive ? "或先停用。" : "删除后不可恢复。" }}
        </p>
        <fieldset class="tag-library__choices">
          <legend class="visually-hidden">选择操作</legend>
          <label v-if="canArchive" class="tag-library__choice">
            <input v-model="inspectAction" type="radio" value="archive" />
            <span>停用</span>
          </label>
          <label class="tag-library__choice">
            <input v-model="inspectAction" type="radio" value="delete" />
            <span>{{ inUse ? "替换后删除" : "删除" }}</span>
          </label>
        </fieldset>
        <label v-if="inspectAction === 'delete' && inUse" class="field">
          <span>替换为</span>
          <select v-model="replacementTagId">
            <option value="">请选择同组启用词</option>
            <option v-for="tag in replacementOptions" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
          </select>
        </label>
        <p v-if="inspectAction === 'delete' && inUse && !replacementOptions.length" class="tag-library__empty">
          同组没有其他启用词，无法替换删除。
        </p>
        <div class="dialog__actions">
          <button class="button button--ghost" type="button" :disabled="busy" @click="closeInspect">取消</button>
          <button
            class="button"
            :class="inspectAction === 'delete' ? 'button--danger' : 'button--primary'"
            type="button"
            :disabled="inspectConfirmDisabled"
            @click="confirmInspect"
          >
            确认
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tag-library__notice {
  margin: 0 0 var(--space-3);
  color: var(--color-muted);
  font-size: 12px;
}
.tag-library__groups {
  display: grid;
  gap: var(--space-4);
}
.tag-library__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
}
.tag-library__heading h2,
.tag-library__heading p {
  margin: 0;
}
.tag-library__heading h2 {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.04em;
}
.tag-library__heading p {
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 400;
}
.tag-library__empty {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
}
.tag-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.tag-chip-wrap {
  position: relative;
  display: inline-flex;
}
.tag-chip {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #fff;
  color: #344054;
  font-size: 12px;
  line-height: 1.2;
}
.tag-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tag-chip--active {
  border-color: #c9d7ee;
  background: #eef4ff;
  color: var(--color-primary);
  font-weight: 650;
}
.tag-chip--archived {
  color: var(--color-muted);
  background: var(--color-surface-soft);
}
.tag-chip__remove {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: #fff;
  color: var(--color-muted);
  transform: translate(4px, -4px);
  opacity: 0;
  pointer-events: none;
}
.tag-chip-wrap:hover .tag-chip__remove,
.tag-chip-wrap:focus-within .tag-chip__remove {
  opacity: 1;
  pointer-events: auto;
}
.tag-chip__remove:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tag-library__choices {
  margin: 0 0 var(--space-3);
  padding: 0;
  border: 0;
  display: grid;
  gap: var(--space-2);
}
.tag-library__choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: 12px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
