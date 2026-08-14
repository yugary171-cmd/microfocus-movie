import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 5174;
const FALLBACK_HOST = "127.0.0.1";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function readOverrideOrigin(): string {
  const fromProcess = process.env.DEMO_MEDIA_ORIGIN?.trim() ?? "";
  if (fromProcess) return stripTrailingSlash(fromProcess);

  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) return "";

  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith("DEMO_MEDIA_ORIGIN="));
  if (!line) return "";

  return stripTrailingSlash(
    line
      .slice("DEMO_MEDIA_ORIGIN=".length)
      .trim()
      .replace(/^["']|["']$/g, "")
  );
}

export function firstLanIPv4(): string {
  const nets = os.networkInterfaces();
  const preferredNames = ["en0", "en1", "eth0", "wlan0"];
  const found: Array<{ name: string; address: string }> = [];

  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      const isV4 = addr.family === "IPv4" || (addr.family as unknown) === 4;
      if (!isV4 || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;
      found.push({ name, address: addr.address });
    }
  }

  for (const name of preferredNames) {
    const hit = found.find((item) => item.name === name);
    if (hit) return hit.address;
  }

  return found[0]?.address ?? FALLBACK_HOST;
}

export function resolveDemoMediaOrigin(port = DEFAULT_PORT): string {
  const override = readOverrideOrigin();
  if (override && /^https?:\/\//i.test(override)) return override;
  return `http://${firstLanIPv4()}:${port}`;
}

export function writeMiniprogramDemoMediaOrigin(origin: string): void {
  const target = path.join(
    repoRoot,
    "apps/miniprogram/miniprogram/config/demo-media-origin.generated.ts"
  );
  const body = `export const DEMO_MEDIA_ORIGIN = ${JSON.stringify(origin)};\n`;
  fs.writeFileSync(target, body, "utf8");
}
