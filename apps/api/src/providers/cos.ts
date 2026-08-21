import { Injectable } from "@nestjs/common";
import {
  POSTER_UPLOAD_TTL_SECONDS,
  type PosterUploadKind,
  type PosterUploadAuthorization
} from "@microfocus/contracts";
import COS from "cos-nodejs-sdk-v5";
import { randomUUID } from "node:crypto";
import { Errors } from "../common/app-error.js";
import { AppConfigService } from "../config/config.service.js";

export interface PosterUploadAuthorizationInput {
  dramaId?: string;
  kind: PosterUploadKind;
  fileName: string;
  contentType: string;
  uploadId?: string;
}

export interface CosObjectMetadata {
  contentLength: number | null;
  contentType: string | null;
}

/**
 * Server-side COS boundary for promotional and cover posters.
 *
 * The SDK instance is only created with server credentials. The browser sees
 * a short-lived PUT URL and a public asset URL, never a SecretId/SecretKey.
 */
@Injectable()
export class CosProviderService {
  private readonly cos: COS | undefined;

  constructor(private readonly config: AppConfigService) {
    const env = config.env;
    if (
      env.POSTER_STORAGE_MODE === "live" &&
      env.TENCENTCLOUD_COS_SECRET_ID &&
      env.TENCENTCLOUD_COS_SECRET_KEY
    ) {
      this.cos = new COS({
        SecretId: env.TENCENTCLOUD_COS_SECRET_ID,
        SecretKey: env.TENCENTCLOUD_COS_SECRET_KEY
      });
    }
  }

  isUploadReady(): boolean {
    return this.config.env.POSTER_STORAGE_MODE === "mock" || Boolean(this.cos && this.hasLiveConfig());
  }

  async createPosterUploadAuthorization(
    input: PosterUploadAuthorizationInput
  ): Promise<PosterUploadAuthorization> {
    const uploadId = input.uploadId ?? randomUUID();
    const expiresAt = new Date(Date.now() + POSTER_UPLOAD_TTL_SECONDS * 1000).toISOString();

    if (this.config.env.POSTER_STORAGE_MODE === "mock") {
      const objectKey = this.objectKey(input, uploadId);
      return {
        uploadId,
        uploadUrl: `${this.config.env.PUBLIC_API_URL}/mock-poster-upload/${encodeURIComponent(uploadId)}`,
        headers: { "Content-Type": input.contentType, "x-microfocus-upload-mode": "mock" },
        objectKey,
        assetUrl: this.assetUrlForObjectKey(objectKey),
        expiresAt,
        mock: true
      };
    }

    const cos = this.requireCos();
    const objectKey = this.objectKey(input, uploadId);
    const env = this.config.env;
    let uploadUrl: string;
    try {
      uploadUrl = cos.getObjectUrl({
        Bucket: env.TENCENTCLOUD_COS_BUCKET!,
        Region: env.TENCENTCLOUD_COS_REGION!,
        Key: objectKey,
        Sign: true,
        Method: "PUT",
        Expires: POSTER_UPLOAD_TTL_SECONDS,
        Headers: { "Content-Type": input.contentType },
        Protocol: "https:"
      });
    } catch {
      throw Errors.providerRequestFailed("Tencent Cloud COS poster upload signing");
    }

    return {
      uploadId,
      uploadUrl,
      headers: { "Content-Type": input.contentType },
      objectKey,
      assetUrl: this.assetUrlForObjectKey(objectKey),
      expiresAt,
      mock: false
    };
  }

  async inspectObject(objectKey: string): Promise<CosObjectMetadata | null> {
    if (this.config.env.POSTER_STORAGE_MODE === "mock") return { contentLength: null, contentType: null };
    const cos = this.requireCos();
    const env = this.config.env;
    try {
      const result = await cos.headObject({
        Bucket: env.TENCENTCLOUD_COS_BUCKET!,
        Region: env.TENCENTCLOUD_COS_REGION!,
        Key: objectKey
      });
      return {
        contentLength: readContentLength(result),
        contentType: readContentType(result)
      };
    } catch (error) {
      if (isMissingCosObject(error)) return null;
      throw Errors.providerRequestFailed("Tencent Cloud COS poster upload verification");
    }
  }

  assetUrlForObjectKey(objectKey: string): string {
    if (this.config.env.POSTER_STORAGE_MODE === "mock") {
      return `${this.config.env.PUBLIC_API_URL}/mock-poster/${encodeURIComponent(objectKey)}`;
    }
    const origin = this.config.env.TENCENTCLOUD_COS_PUBLIC_ORIGIN;
    if (!origin) throw Errors.providerNotConfigured("Tencent Cloud COS poster storage");
    const base = origin.endsWith("/") ? origin : `${origin}/`;
    return new URL(objectKey.split("/").map(encodeURIComponent).join("/"), base).toString();
  }

  private objectKey(input: PosterUploadAuthorizationInput, uploadId: string): string {
    const prefix = this.config.env.TENCENTCLOUD_COS_PREFIX.replace(/^\/+|\/+$/g, "");
    const dramaScope = input.dramaId?.trim() || "pending";
    const safeName = input.fileName.trim().replace(/[^A-Za-z0-9._-]/g, "_");
    return `${prefix}/${dramaScope}/${input.kind}/${uploadId}/${safeName}`;
  }

  private hasLiveConfig(): boolean {
    const env = this.config.env;
    return Boolean(
      env.TENCENTCLOUD_COS_SECRET_ID &&
        env.TENCENTCLOUD_COS_SECRET_KEY &&
        env.TENCENTCLOUD_COS_BUCKET &&
        env.TENCENTCLOUD_COS_REGION &&
        env.TENCENTCLOUD_COS_PUBLIC_ORIGIN
    );
  }

  private requireCos(): COS {
    if (!this.hasLiveConfig() || !this.cos) {
      throw Errors.providerNotConfigured("Tencent Cloud COS poster storage");
    }
    return this.cos;
  }
}

function readContentLength(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.ContentLength ?? record["content-length"];
  const parsed = typeof candidate === "number" ? candidate : Number(candidate);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readContentType(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const candidate = record.ContentType ?? record["content-type"];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function isMissingCosObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  const statusCode = record.statusCode ?? record.status;
  return statusCode === 404 || record.code === "NoSuchKey" || record.code === "NotFound";
}
