import { demoVideoUrls } from "./demo-media";

const demoVideos = demoVideoUrls(import.meta.env.VITE_DEMO_MEDIA_ORIGIN);

export const RUNTIME_CONFIG = {
  apiBaseUrl: "",
  requestTimeoutMs: 10_000,
  productName: "微焦短剧",
  // Mock-only videos served by `npm run dev:admin`. Production playback comes
  // from the API/VOD lease over HTTPS and never uses these fallbacks.
  demoVideoUrl: demoVideos.demoVideoUrl,
  demoVideoTwoUrl: demoVideos.demoVideoTwoUrl,
  demoVideoUrls: demoVideos.urls
};
