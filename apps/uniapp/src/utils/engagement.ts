export function formatEngagementCount(value: number): string {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count >= 10_000) {
    const wan = count / 10_000;
    const label = Number.isInteger(wan) ? String(wan) : wan.toFixed(1).replace(/\.0$/, "");
    return `${label}万`;
  }
  return String(count);
}

export function shareDramaText(title: string, episodeLabel: string): string {
  const safeTitle = title.trim() || "微焦短剧";
  const episode = episodeLabel.trim();
  return episode ? `${safeTitle} · ${episode}` : safeTitle;
}

export function copyShareText(text: string): void {
  const value = text.trim();
  if (!value) return;
  try {
    uni.setClipboardData({
      data: value,
      success: () => uni.showToast({ title: "已复制分享文案", icon: "none" }),
      fail: () => uni.showToast({ title: "暂时无法分享", icon: "none" })
    });
  } catch {
    uni.showToast({ title: "暂时无法分享", icon: "none" });
  }
}

/** Mock, unpublished or rights-invalid titles must not produce an outward share payload. */
export function shareIfExternallyAllowed(text: string, allowExternalShare: boolean): boolean {
  if (!allowExternalShare) {
    uni.showToast({ title: "内部体验不可外部分享", icon: "none" });
    return false;
  }
  copyShareText(text);
  return true;
}
