#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = path.join(repoRoot, "apps/admin/public/demo");
const targets = ["short-drama.mp4", "second-short-drama.mp4"];

function resolveFfmpeg() {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const found = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
  const resolved = found.stdout.trim();
  if (found.status === 0 && resolved) return resolved;
  throw new Error("未找到 ffmpeg。请先安装（macOS: brew install ffmpeg），或设置 FFMPEG_PATH。");
}

function run(ffmpeg, args) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ffmpeg failed");
  }
}

const ffmpeg = resolveFfmpeg();

for (const file of targets) {
  const source = path.join(demoDir, file);
  const temporary = path.join(demoDir, `.${file}.normalized.tmp.mp4`);
  if (!fs.existsSync(source)) {
    throw new Error(`找不到示例视频：${source}`);
  }

  run(ffmpeg, [
    "-y",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-profile:a",
    "aac_low",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    temporary
  ]);

  fs.renameSync(temporary, source);
  process.stdout.write(`normalized ${file}\n`);
}

process.stdout.write("demo videos are now H.264 Baseline + AAC-LC compatible files\n");
