export function getStorageSync<T = string>(key: string): T | "" {
  try {
    return (uni.getStorageSync(key) as T) || ("" as T);
  } catch {
    return "" as T;
  }
}

export function setStorageSync(key: string, value: unknown): void {
  uni.setStorageSync(key, value);
}

export function removeStorageSync(key: string): void {
  uni.removeStorageSync(key);
}
