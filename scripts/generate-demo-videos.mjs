#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "apps/admin/public/demo");
const durationSeconds = 6;

const clips = [
  { file: "mock-03-starlight.mp4", title: "Starlight", color: "0x1a2744" },
  { file: "mock-04-contract.mp4", title: "Contract", color: "0x3b1d2f" },
  { file: "mock-05-letter.mp4", title: "Letter", color: "0x16332b" },
  { file: "mock-06-return.mp4", title: "Return", color: "0x2a2140" },
  { file: "mock-07-garden.mp4", title: "Garden", color: "0x3d2a18" },
  { file: "mock-08-dragon.mp4", title: "Dragon", color: "0x1c3048" },
  { file: "mock-09-heir.mp4", title: "Heir", color: "0x402020" },
  { file: "mock-10-healer.mp4", title: "Healer", color: "0x243018" }
];

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

fs.mkdirSync(outputDir, { recursive: true });
const ffmpeg = resolveFfmpeg();

for (const clip of clips) {
  const target = path.join(outputDir, clip.file);
  const filters = [
    "drawbox=x=(w-520)/2:y=h/2-140:w=520:h=88:color=white@0.88:t=fill",
    "drawbox=x=(w-360)/2:y=h/2+20:w=360:h=18:color=white@0.45:t=fill",
    "fade=t=in:st=0:d=0.35"
  ].join(",");
  run(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${clip.color}:s=720x1280:d=${durationSeconds}:r=30`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSeconds}`,
    "-vf",
    filters,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-shortest",
    "-movflags",
    "+faststart",
    target
  ]);
  const sizeKb = Math.round(fs.statSync(target).size / 1024);
  process.stdout.write(`wrote ${clip.file} [${clip.title}] (${sizeKb} KB)\n`);
}

process.stdout.write(`generated ${clips.length} mock videos in ${outputDir}\n`);
process.stdout.write("kept existing uploads: short-drama.mp4, second-short-drama.mp4\n");
