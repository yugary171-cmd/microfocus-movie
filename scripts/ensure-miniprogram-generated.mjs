import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.join(repoRoot, "apps/miniprogram/miniprogram/config");

const files = {
  "api-base-url.generated.ts": 'export const API_BASE_URL = "";\n',
  "demo-media-origin.generated.ts": 'export const DEMO_MEDIA_ORIGIN = "";\n',
};

for (const [name, body] of Object.entries(files)) {
  const target = path.join(configDir, name);
  if (!fs.existsSync(target)) fs.writeFileSync(target, body, "utf8");
}
