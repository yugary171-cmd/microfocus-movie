export function createVideoContext(id: string): UniApp.VideoContext {
  return uni.createVideoContext(id);
}

export function onNetworkStatusChange(
  listener: (result: UniApp.OnNetworkStatusChangeSuccess) => void
): void {
  uni.onNetworkStatusChange(listener);
}

export function offNetworkStatusChange(
  listener: (result: UniApp.OnNetworkStatusChangeSuccess) => void
): void {
  uni.offNetworkStatusChange(listener);
}

export function getNetworkType(): Promise<string> {
  return new Promise((resolve) => {
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType || "unknown"),
      fail: () => resolve("unknown")
    });
  });
}
