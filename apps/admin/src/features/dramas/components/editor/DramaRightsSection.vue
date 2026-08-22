<script setup lang="ts">
import {
  RIGHTS_DOCUMENT_MAX_LENGTH,
  RIGHTS_HOLDER_MAX_LENGTH,
  RIGHTS_MATERIAL_DIGEST_INPUT_PATTERN,
  RIGHTS_MATERIAL_DIGEST_LENGTH,
  RIGHTS_MATERIAL_KEY_MAX_LENGTH,
} from "@microfocus/contracts";
import { ElInput as ElementInput } from "element-plus";
import type { Component } from "vue";
import { StatusBadge } from "@/shared/components";
import type { DramaInput } from "@/shared/types";

const ElInput = ElementInput as Component;

const props = defineProps<{
  form: DramaInput;
  canEdit: boolean;
  rightsFilled: boolean;
}>();

const emit = defineEmits<{
  "update:form": [patch: Partial<DramaInput>];
}>();

function update<K extends keyof DramaInput>(key: K, value: DramaInput[K]): void {
  emit("update:form", { [key]: value } as Partial<DramaInput>);
}
</script>

<template>
  <section class="panel" aria-labelledby="rights-title">
    <div class="panel__header">
      <div>
        <p class="eyebrow">RIGHTS & LICENSE</p>
        <h2 id="rights-title">版权与许可</h2>
      </div>
      <StatusBadge :label="rightsFilled ? '资料已填写' : '待补齐'" :tone="rightsFilled ? 'success' : 'warning'" />
    </div>
    <p :class="$style['rights-hint']">草稿可暂不填写。提交审核或发布前须补齐权利方、许可、材料与全部授权范围。</p>
    <div class="form-grid">
      <label class="field">
        <span>权利方</span>
        <el-input class="admin-input" :model-value="form.rightsHolder" :disabled="!canEdit" :maxlength="RIGHTS_HOLDER_MAX_LENGTH" @update:model-value="update('rightsHolder', $event)" />
      </label>
      <label class="field">
        <span>许可 / 备案编号</span>
        <el-input class="admin-input" :model-value="form.licenseNumber" :disabled="!canEdit" :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH" @update:model-value="update('licenseNumber', $event)" />
      </label>
      <label class="field">
        <span>许可起始日</span>
        <el-input class="admin-input" type="date" :model-value="form.rightsValidFrom" :disabled="!canEdit" @update:model-value="update('rightsValidFrom', $event)" />
      </label>
      <label class="field">
        <span>许可到期日</span>
        <el-input class="admin-input" type="date" :model-value="form.licenseExpiresAt" :disabled="!canEdit" @update:model-value="update('licenseExpiresAt', $event)" />
      </label>
      <label class="field">
        <span>报备号</span>
        <el-input class="admin-input" :model-value="form.rightsReportNumber" :disabled="!canEdit" :maxlength="RIGHTS_DOCUMENT_MAX_LENGTH" @update:model-value="update('rightsReportNumber', $event)" />
      </label>
      <label class="field">
        <span>私有材料对象键</span>
        <el-input class="admin-input" :model-value="form.rightsMaterialObjectKey" :disabled="!canEdit" :maxlength="RIGHTS_MATERIAL_KEY_MAX_LENGTH" placeholder="rights/…/document.pdf" @update:model-value="update('rightsMaterialObjectKey', $event)" />
        <small>仅填写私有对象存储键，不使用公开 URL</small>
      </label>
      <label class="field field--wide">
        <span>材料 SHA-256 摘要</span>
        <el-input
          class="admin-input"
          :model-value="form.rightsMaterialDigestSha256"
          :disabled="!canEdit"
          :minlength="RIGHTS_MATERIAL_DIGEST_LENGTH"
          :maxlength="RIGHTS_MATERIAL_DIGEST_LENGTH"
          :pattern="RIGHTS_MATERIAL_DIGEST_INPUT_PATTERN"
          spellcheck="false"
          autocomplete="off"
          placeholder="64 位十六进制摘要"
          @update:model-value="update('rightsMaterialDigestSha256', $event)"
        />
      </label>
      <fieldset :class="[$style['rights-scope'], 'field--wide']" :disabled="!canEdit">
        <legend>授权范围（填写版权时须逐项确认）</legend>
        <label><input :checked="form.allowsWechatDistribution" type="checkbox" @change="update('allowsWechatDistribution', ($event.target as HTMLInputElement).checked)" />允许微信分发</label>
        <label><input :checked="form.allowsAdMonetization" type="checkbox" @change="update('allowsAdMonetization', ($event.target as HTMLInputElement).checked)" />允许广告变现</label>
        <label><input :checked="form.allowsTranscoding" type="checkbox" @change="update('allowsTranscoding', ($event.target as HTMLInputElement).checked)" />允许媒体转码</label>
        <label><input :checked="form.allowsPromotionalMaterial" type="checkbox" @change="update('allowsPromotionalMaterial', ($event.target as HTMLInputElement).checked)" />允许制作宣传材料</label>
      </fieldset>
    </div>
  </section>
</template>

<style module lang="scss" src="../../styles/drama-editor.module.scss"></style>
