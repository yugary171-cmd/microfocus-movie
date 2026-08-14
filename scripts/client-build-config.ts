import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDemoMediaOrigin, writeMiniprogramDemoMediaOrigin } from "./demo-media-origin";

export type ClientBuildMode = "mock" | "live";

export type ClientBuildConfig = {
  mode: ClientBuildMode;
  apiBaseUrl: string;
  demoMediaOrigin: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_ENV_KEYS = [
  "MICROFOCUS_CLIENT_MODE",
  "MICROFOCUS_PUBLIC_API_URL",
  "VITE_API_BASE_URL",
] as const;

const DEMO_MEDIA_MARKERS = [
  "127.0.0.1:5174",
  "/demo/short-drama.mp4",
  "/demo/second-short-drama.mp4",
  "mock-03-starlight.mp4",
  "mock-04-contract.mp4",
  "mock-05-letter.mp4",
  "mock-06-return.mp4",
  "mock-07-garden.mp4",
  "mock-08-dragon.mp4",
  "mock-09-heir.mp4",
  "mock-10-healer.mp4",
];

export class ClientBuildConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientBuildConfigError";
  }
}

export function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function resolveClientBuildMode(
  env: Record<string, string | undefined> = process.env,
): ClientBuildMode {
  const raw = (env.MICROFOCUS_CLIENT_MODE ?? "").trim().toLowerCase();
  if (!raw || raw === "mock") return "mock";
  if (raw === "live") return "live";
  throw new ClientBuildConfigError(
    `MICROFOCUS_CLIENT_MODE 只能是 mock 或 live，收到 ${raw}`,
  );
}

export function readPublicApiUrl(env: Record<string, string | undefined> = process.env): string {
  const fromCanonical = env.MICROFOCUS_PUBLIC_API_URL?.trim() ?? "";
  const fromVite = env.VITE_API_BASE_URL?.trim() ?? "";
  return stripTrailingSlash(fromCanonical || fromVite);
}

export function assertLivePublicApiUrl(url: string): string {
  const trimmed = stripTrailingSlash(url.trim());
  if (!trimmed) {
    throw new ClientBuildConfigError(
      "外部构建缺少公开 API 地址。请设置 MICROFOCUS_PUBLIC_API_URL 或 VITE_API_BASE_URL 为 https 域名。",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ClientBuildConfigError("公开 API 地址不是合法 URL。");
  }

  if (parsed.protocol !== "https:") {
    throw new ClientBuildConfigError("外部构建的 API 地址必须是 https。");
  }
  if (parsed.username || parsed.password) {
    throw new ClientBuildConfigError("公开 API 地址不能包含用户名或密码。");
  }
  if (parsed.search || parsed.hash) {
    throw new ClientBuildConfigError("公开 API 地址不能包含查询串或片段。");
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new ClientBuildConfigError("公开 API 地址不能包含路径。");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new ClientBuildConfigError("外部构建的 API 地址不能使用非 443 端口。");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    throw new ClientBuildConfigError("外部构建不能使用 localhost 或本机回环地址。");
  }
  if (isIpHostname(hostname)) {
    throw new ClientBuildConfigError("外部构建的 API 地址必须是域名，不能是 IP。");
  }
  if (!hostname.includes(".") || hostname.startsWith(".") || hostname.endsWith(".")) {
    throw new ClientBuildConfigError("外部构建的 API 地址主机名无效。");
  }

  return stripTrailingSlash(parsed.origin);
}

export function resolveClientBuildConfig(
  env: Record<string, string | undefined> = process.env,
): ClientBuildConfig {
  const mode = resolveClientBuildMode(env);
  const rawUrl = readPublicApiUrl(env);

  if (mode === "live") {
    return {
      mode,
      apiBaseUrl: assertLivePublicApiUrl(rawUrl),
      demoMediaOrigin: "",
    };
  }

  if (rawUrl && /^https?:\/\//i.test(rawUrl)) {
    return { mode, apiBaseUrl: rawUrl, demoMediaOrigin: "" };
  }

  return { mode, apiBaseUrl: "", demoMediaOrigin: "" };
}

export function loadRootClientBuildEnv(
  env: Record<string, string | undefined> = process.env,
  envFilePath = path.join(repoRoot, ".env"),
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...env };
  if (!fs.existsSync(envFilePath)) return merged;

  const values = parseDotEnvKeys(fs.readFileSync(envFilePath, "utf8"), CLIENT_ENV_KEYS);
  for (const key of CLIENT_ENV_KEYS) {
    if (!merged[key]?.trim() && values[key]) merged[key] = values[key];
  }
  return merged;
}

export function parseDotEnvKeys(contents: string, keys: readonly string[]): Record<string, string> {
  const wanted = new Set(keys);
  const result: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!wanted.has(key) || result[key]) continue;
    result[key] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return result;
}

export function applyClientBuildArtifacts(
  env: Record<string, string | undefined> = process.env,
): ClientBuildConfig {
  const resolved = resolveClientBuildConfig(loadRootClientBuildEnv(env));
  const demoMediaOrigin =
    resolved.mode === "mock" ? resolveDemoMediaOrigin() : "";

  if (resolved.apiBaseUrl) {
    process.env.VITE_API_BASE_URL = resolved.apiBaseUrl;
    process.env.MICROFOCUS_PUBLIC_API_URL = resolved.apiBaseUrl;
  }
  process.env.MICROFOCUS_CLIENT_MODE = resolved.mode;
  if (resolved.mode === "mock") {
    process.env.VITE_DEMO_MEDIA_ORIGIN = demoMediaOrigin;
  } else {
    delete process.env.VITE_DEMO_MEDIA_ORIGIN;
    process.env.DEMO_MEDIA_ORIGIN = "";
  }

  writeMiniprogramDemoMediaOrigin(demoMediaOrigin);
  writeMiniprogramApiBaseUrl(resolved.apiBaseUrl);
  return { ...resolved, demoMediaOrigin };
}

export function writeMiniprogramApiBaseUrl(apiBaseUrl: string): void {
  const target = path.join(
    repoRoot,
    "apps/miniprogram/miniprogram/config/api-base-url.generated.ts",
  );
  fs.writeFileSync(target, `export const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`, "utf8");
}

export function ensureMiniprogramGeneratedFiles(): void {
  const apiTarget = path.join(
    repoRoot,
    "apps/miniprogram/miniprogram/config/api-base-url.generated.ts",
  );
  const demoTarget = path.join(
    repoRoot,
    "apps/miniprogram/miniprogram/config/demo-media-origin.generated.ts",
  );
  if (!fs.existsSync(apiTarget)) writeMiniprogramApiBaseUrl("");
  if (!fs.existsSync(demoTarget)) writeMiniprogramDemoMediaOrigin("");
}

export function collectLiveArtifactViolations(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    throw new ClientBuildConfigError(`构建产物目录不存在：${rootDir}`);
  }

  const violations: string[] = [];
  for (const file of listFiles(rootDir)) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const marker of DEMO_MEDIA_MARKERS) {
      if (text.includes(marker)) {
        violations.push(`${path.relative(rootDir, file)} contains ${marker}`);
      }
    }
  }
  return violations;
}

export function assertLiveClientArtifact(rootDir: string): void {
  const violations = collectLiveArtifactViolations(rootDir);
  if (violations.length > 0) {
    throw new ClientBuildConfigError(
      `外部构建产物包含 Demo 媒体痕迹：\n${violations.slice(0, 20).join("\n")}`,
    );
  }
}

function isIpHostname(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}

function listFiles(rootDir: string): string[] {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) files.push(full);
    }
  }
  return files;
}
