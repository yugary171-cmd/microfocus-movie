import { demoVideoUrls } from "./demo-media";

const demoOrigin = import.meta.env.VITE_DEMO_MEDIA_ORIGIN;
const demoVideos =
  demoOrigin === ""
    ? { demoVideoUrl: "", demoVideoTwoUrl: "", urls: [] as string[] }
    : demoVideoUrls(demoOrigin);

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
