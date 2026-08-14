export function formatRemainingTime(seconds: number | null | undefined): string {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (safeSeconds < 60) return `${safeSeconds}秒`;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}分钟`;
  return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "暂无到期时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "到期时间未知";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatPosition(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
