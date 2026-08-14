export const FALLBACK_DEMO_MEDIA_ORIGIN = "";
export const DEMO_VIDEO_FILES = [] as const;

export function normalizeDemoMediaOrigin(_value: string | undefined): string {
  return "";
}

export function demoVideoUrls(_origin: string | undefined) {
  return {
    demoVideoUrl: "",
    demoVideoTwoUrl: "",
    urls: [] as string[],
  };
}

export function pickDemoVideoUrl(
  _urls: readonly string[],
  _seed: string,
  fallback = "",
): string {
  return fallback;
}
