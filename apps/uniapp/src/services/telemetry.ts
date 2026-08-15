import { ENTITY_ID_MAX_LENGTH, FUNNEL_EVENTS, type FunnelEventName } from "@microfocus/contracts";

const SENSITIVE_KEY = /(token|secret|authorization|session_key|password|cookie|openid)/i;

export function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENTS as readonly string[]).includes(name);
}

export function sanitizeFunnelProps(props: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  if (!props) return safe;
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") {
      safe[key] = value.trim().slice(0, ENTITY_ID_MAX_LENGTH);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return safe;
}

const buffer: Array<{ event: FunnelEventName; props: Record<string, string | number | boolean> }> = [];

export function trackFunnelEvent(event: FunnelEventName, props?: Record<string, unknown>): void {
  if (!isFunnelEvent(event)) return;
  buffer.push({ event, props: sanitizeFunnelProps(props) });
  if (buffer.length > 50) buffer.shift();
}

export function recentFunnelEvents(): Array<{ event: FunnelEventName; props: Record<string, string | number | boolean> }> {
  return [...buffer];
}
