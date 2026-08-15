import {
  COVER_URL_MAX_LENGTH,
  DRAMA_CATEGORY_MAX_LENGTH,
  DRAMA_EPISODE_MAX_COUNT,
  DRAMA_SUMMARY_MAX_LENGTH,
  DRAMA_TAG_MAX_COUNT,
  DRAMA_TAG_MAX_LENGTH,
  DRAMA_TITLE_MAX_LENGTH,
  EPISODE_DURATION_SECONDS_MAX,
  EPISODE_TITLE_MAX_LENGTH,
  RIGHTS_DOCUMENT_MAX_LENGTH,
  RIGHTS_HOLDER_MAX_LENGTH,
  RIGHTS_MATERIAL_KEY_MAX_LENGTH,
  UPLOAD_FILE_NAME_MAX_LENGTH,
  isAllowedUploadFileName,
  isAllowedUploadFileSize,
  isRightsMaterialDigest,
  resolveUploadContentType,
} from "@microfocus/contracts";
import type { DramaInput } from "@/types/admin";

export function uploadFileNameError(fileName: string): string {
  if (isAllowedUploadFileName(fileName)) return "";
  const name = fileName.trim();
  if (!name) return "文件名不能为空";
  if (/[/\\\0]/.test(name)) return "文件名不能包含路径分隔符";
  return `文件名不能超过 ${UPLOAD_FILE_NAME_MAX_LENGTH} 个字符`;
}

export function uploadFileError(file: { name: string; size: number; type?: string }): string {
  const nameError = uploadFileNameError(file.name);
  if (nameError) return nameError;
  if (!isAllowedUploadFileSize(file.size)) {
    if (!Number.isFinite(file.size) || file.size < 1) return "文件不能为空";
    return "文件不能超过 5GB";
  }
  if (!resolveUploadContentType(file.type ?? "")) return "仅支持 MP4、MOV、WebM 视频文件";
  return "";
}

export function dramaDraftError(input: DramaInput): string {
  if (input.title.length > DRAMA_TITLE_MAX_LENGTH) {
    return `剧名不能超过 ${DRAMA_TITLE_MAX_LENGTH} 字`;
  }
  if (input.summary.length > DRAMA_SUMMARY_MAX_LENGTH) {
    return `简介不能超过 ${DRAMA_SUMMARY_MAX_LENGTH} 字`;
  }
  if (input.category.length > DRAMA_CATEGORY_MAX_LENGTH) {
    return `分类不能超过 ${DRAMA_CATEGORY_MAX_LENGTH} 字`;
  }
  if (input.coverUrl.length > COVER_URL_MAX_LENGTH) {
    return `封面 URL 不能超过 ${COVER_URL_MAX_LENGTH} 字`;
  }
  if (input.tags.length > DRAMA_TAG_MAX_COUNT) {
    return `标签最多 ${DRAMA_TAG_MAX_COUNT} 个`;
  }
  if (input.tags.some((tag) => tag.length > DRAMA_TAG_MAX_LENGTH)) {
    return `单个标签不能超过 ${DRAMA_TAG_MAX_LENGTH} 字`;
  }
  if (input.rightsHolder.length > RIGHTS_HOLDER_MAX_LENGTH) {
    return `权利方不能超过 ${RIGHTS_HOLDER_MAX_LENGTH} 字`;
  }
  if (input.licenseNumber.length > RIGHTS_DOCUMENT_MAX_LENGTH) {
    return `许可编号不能超过 ${RIGHTS_DOCUMENT_MAX_LENGTH} 字`;
  }
  if (input.rightsReportNumber.length > RIGHTS_DOCUMENT_MAX_LENGTH) {
    return `报备号不能超过 ${RIGHTS_DOCUMENT_MAX_LENGTH} 字`;
  }
  if (input.rightsMaterialObjectKey.length > RIGHTS_MATERIAL_KEY_MAX_LENGTH) {
    return `材料对象键不能超过 ${RIGHTS_MATERIAL_KEY_MAX_LENGTH} 字`;
  }
  if (input.rightsMaterialDigestSha256.trim() && !isRightsMaterialDigest(input.rightsMaterialDigestSha256)) {
    return "材料 SHA-256 必须是 64 位十六进制摘要";
  }
  if (input.episodes.length > DRAMA_EPISODE_MAX_COUNT) {
    return `集数不能超过 ${DRAMA_EPISODE_MAX_COUNT}`;
  }
  if (input.episodes.some((episode) => episode.title.length > EPISODE_TITLE_MAX_LENGTH)) {
    return `集标题不能超过 ${EPISODE_TITLE_MAX_LENGTH} 字`;
  }
  if (
    input.episodes.some(
      (episode) =>
        episode.durationSeconds < 1 || episode.durationSeconds > EPISODE_DURATION_SECONDS_MAX,
    )
  ) {
    return `单集时长须在 1–${EPISODE_DURATION_SECONDS_MAX} 秒`;
  }
  return "";
}
