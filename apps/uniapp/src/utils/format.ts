import {
  approximateRemainingEpisodeCount,
  approximateRewardEpisodeCount,
  medianPositiveDurationSeconds,
  REWARD_TTL_SECONDS
} from "@microfocus/contracts";

export const ENTITLEMENT_SCOPE_LABEL = "仅本剧有效";
export const ENTITLEMENT_INCOMPLETE_AD_LABEL = "广告未看完不发奖";

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

export function episodeDurationsFromDrama(
  drama: { episodes?: ReadonlyArray<{ durationSeconds?: number | null }> } | null | undefined
): number[] {
  return (drama?.episodes ?? [])
    .map((episode) => Number(episode.durationSeconds))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function formatApproximateRemainingEpisodes(
  remainingSeconds: number | null | undefined,
  durationsSeconds: readonly number[]
): string {
  const seconds = Math.max(0, Math.floor(Number(remainingSeconds) || 0));
  const median = medianPositiveDurationSeconds(durationsSeconds);
  if (median == null) return formatRemainingTime(seconds);
  const count = approximateRemainingEpisodeCount(seconds, median);
  if (seconds > 0 && count === 0) return "不足1集";
  return `约 ${count} 集`;
}

export function formatRewardUnlockCopy(
  dramaTitle: string,
  durationsSeconds: readonly number[]
): string {
  const title = dramaTitle.trim() || "本剧";
  const episodes = approximateRewardEpisodeCount(durationsSeconds);
  const hours = Math.max(1, Math.floor(REWARD_TTL_SECONDS / 3600));
  return `完整观看一条激励广告后，为「${title}」增加约 ${episodes} 集观看时间，${hours} 小时内有效；${ENTITLEMENT_INCOMPLETE_AD_LABEL}。${ENTITLEMENT_SCOPE_LABEL}。`;
}
