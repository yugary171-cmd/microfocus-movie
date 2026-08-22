export function useClipboard() {
  async function copy(value: string): Promise<void> {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
    await navigator.clipboard.writeText(value);
  }

  return { copy };
}
