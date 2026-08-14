import { demoVideoUrls } from "./demo-media";
import { DEMO_MEDIA_ORIGIN } from "./demo-media-origin.generated";

const demoVideos = demoVideoUrls(DEMO_MEDIA_ORIGIN);

export const RUNTIME_CONFIG = {
  apiBaseUrl: "",
  requestTimeoutMs: 10_000,
  productName: "微焦短剧",
  // Overwritten locally by `npm run dev:admin` / `npm run dev:uniapp` with this
  // computer's LAN IPv4. Production playback comes from the VOD lease over HTTPS.
  demoVideoUrl: demoVideos.demoVideoUrl,
  demoVideoTwoUrl: demoVideos.demoVideoTwoUrl,
  demoVideoUrls: demoVideos.urls
};
