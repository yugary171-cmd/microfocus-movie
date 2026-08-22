import type { UploadSignature } from "@/shared/types";
import { isMockMode } from "../client";

export async function uploadDirect(
  signature: UploadSignature,
  file: File,
  onProgress: (value: number) => void,
): Promise<string> {
  if (signature.mock || isMockMode) {
    for (const progress of [12, 28, 47, 68, 86, 100]) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      onProgress(progress);
    }
    return `mock-vod-${crypto.randomUUID()}`;
  }
  if (!signature.signature) throw new Error("VOD 上传签名缺失，请联系管理员完成 Provider 配置");
  const { default: TcVod } = await import("vod-js-sdk-v6");
  const tcVod = new TcVod({ getSignature: async () => signature.signature ?? "" });
  const uploader = tcVod.upload({ mediaFile: file, mediaName: file.name, enableResume: true });
  uploader.on("media_progress", (info: { percent?: number }) => {
    if (typeof info.percent === "number") onProgress(Math.max(0, Math.min(100, Math.round(info.percent))));
  });
  const result = await uploader.done() as { fileId?: unknown };
  if (typeof result.fileId !== "string" || !result.fileId) {
    throw new Error("VOD 上传完成但未返回 fileId");
  }
  return result.fileId;
}

export async function uploadObject(
  authorization: { uploadUrl: string; headers: Record<string, string> },
  file: File,
  onProgress: (value: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", authorization.uploadUrl);
    for (const [key, value] of Object.entries(authorization.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`海报上传失败（HTTP ${xhr.status}）`));
    });
    xhr.addEventListener("error", () => reject(new Error("海报上传网络中断，请重试")));
    xhr.addEventListener("abort", () => reject(new Error("海报上传已取消")));
    xhr.send(file);
  });
}
