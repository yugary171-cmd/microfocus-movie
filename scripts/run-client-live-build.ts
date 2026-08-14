import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyClientBuildArtifacts,
  assertLiveClientArtifact,
  ClientBuildConfigError,
} from "./client-build-config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

const targets: Record<string, { npmArgs: string[]; artifactDir: string }> = {
  admin: {
    npmArgs: ["run", "build", "-w", "@microfocus/admin"],
    artifactDir: path.join(repoRoot, "apps/admin/dist"),
  },
  uniapp: {
    npmArgs: ["run", "build:mp-weixin", "-w", "@microfocus/uniapp"],
    artifactDir: path.join(repoRoot, "apps/uniapp/dist/build/mp-weixin"),
  },
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!target || !(target in targets)) {
  fail("Usage: tsx scripts/run-client-live-build.ts <admin|uniapp>");
}

process.env.MICROFOCUS_CLIENT_MODE = "live";

try {
  applyClientBuildArtifacts();
} catch (error) {
  fail(error instanceof ClientBuildConfigError ? error.message : String(error));
}

const selected = targets[target];
const build = spawnSync("npm", selected.npmArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

try {
  assertLiveClientArtifact(selected.artifactDir);
} catch (error) {
  fail(error instanceof ClientBuildConfigError ? error.message : String(error));
}
