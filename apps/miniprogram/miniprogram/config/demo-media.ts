export const FALLBACK_DEMO_MEDIA_ORIGIN = "http://127.0.0.1:5174";

export const DEMO_VIDEO_FILES = [
  "short-drama.mp4",
  "second-short-drama.mp4",
  "mock-03-starlight.mp4",
  "mock-04-contract.mp4",
  "mock-05-letter.mp4",
  "mock-06-return.mp4",
  "mock-07-garden.mp4",
  "mock-08-dragon.mp4",
  "mock-09-heir.mp4",
  "mock-10-healer.mp4"
] as const;

export function normalizeDemoMediaOrigin(value: string | undefined): string {
  const trimmed = (value || "").trim().replace(/\/$/, "");
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return FALLBACK_DEMO_MEDIA_ORIGIN;
  return trimmed;
}

export function demoVideoUrls(origin: string | undefined) {
  const base = normalizeDemoMediaOrigin(origin);
  const urls = DEMO_VIDEO_FILES.map((file) => `${base}/demo/${file}`);
  return {
    demoVideoUrl: urls[0] ?? `${base}/demo/short-drama.mp4`,
    demoVideoTwoUrl: urls[1] ?? `${base}/demo/second-short-drama.mp4`,
    urls
  };
}

export function pickDemoVideoUrl(urls: readonly string[], seed: string, fallback = ""): string {
  if (!urls.length) return fallback;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash + seed.charCodeAt(index) * (index + 1)) % 2_147_483_647;
  }
  return urls[hash % urls.length] ?? fallback;
}
