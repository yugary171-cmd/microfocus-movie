const demoOrigin = import.meta.env.VITE_DEMO_MEDIA_ORIGIN;
const demoVideoFiles = [
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
];
const demoVideos = (() => {
  if (demoOrigin === "") return { demoVideoUrl: "", demoVideoTwoUrl: "", urls: [] as string[] };
  const base = (demoOrigin || "http://127.0.0.1:5174").trim().replace(/\/$/, "");
  const urls = demoVideoFiles.map((file) => `${base}/demo/${file}`);
  return {
    demoVideoUrl: urls[0] ?? `${base}/demo/short-drama.mp4`,
    demoVideoTwoUrl: urls[1] ?? `${base}/demo/second-short-drama.mp4`,
    urls
  };
})();

export const RUNTIME_CONFIG = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  requestTimeoutMs: 10_000,
  productName: "微焦短剧",
  // Mock-only videos served by `npm run dev:admin`. Production playback comes
  // from the API/VOD lease over HTTPS and never uses these fallbacks.
  demoVideoUrl: demoVideos.demoVideoUrl,
  demoVideoTwoUrl: demoVideos.demoVideoTwoUrl,
  demoVideoUrls: demoVideos.urls
};
