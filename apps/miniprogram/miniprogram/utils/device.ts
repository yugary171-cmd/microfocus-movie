const DEVICE_ID_KEY = "microfocus.device-id";

export function getDeviceId(): string {
  const existing = wx.getStorageSync<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const random = Math.random().toString(36).slice(2);
  const created = `mp-${Date.now().toString(36)}-${random}`;
  wx.setStorageSync(DEVICE_ID_KEY, created);
  return created;
}
