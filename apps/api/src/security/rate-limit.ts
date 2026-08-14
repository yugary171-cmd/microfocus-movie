import { createHash } from "node:crypto";
import { Errors } from "../common/app-error.js";

export const RATE_LIMITS = {
  wechatLogin: { limit: 20, windowMs: 5 * 60_000 },
  adminLogin: { limit: 8, windowMs: 5 * 60_000 },
  anonymousSession: { limit: 10, windowMs: 10 * 60_000 },
  playbackLease: { limit: 20, windowMs: 60_000 },
  playbackHeartbeat: { limit: 60, windowMs: 60_000 },
  playbackRenew: { limit: 20, windowMs: 60_000 },
  playbackRecover: { limit: 10, windowMs: 60_000 },
  playbackClose: { limit: 20, windowMs: 60_000 },
  watchProgress: { limit: 60, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  catalog: { limit: 60, windowMs: 60_000 },
  dramaDetail: { limit: 60, windowMs: 60_000 },
  callbackVod: { limit: 120, windowMs: 60_000 },
  callbackReward: { limit: 60, windowMs: 60_000 },
  adminWrite: { limit: 40, windowMs: 60_000 },
  rewardChallenge: { limit: 3, windowMs: 5 * 60_000 },
  rewardComplete: { limit: 20, windowMs: 60_000 }
} as const;

export type RateLimitStore = {
  rateLimitBucket: {
    findUnique(args: unknown): Promise<{ windowStart: Date; count: number } | null>;
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

export type SocketRequest = {
  ip?: string;
  socket?: { remoteAddress?: string | null };
};

export function requestIpKey(request: SocketRequest): string {
  const ip = request.socket?.remoteAddress?.trim() || request.ip?.trim() || "unknown";
  return ip.slice(0, 128);
}

export function rateLimitBucketId(scope: string, key: string): string {
  const digest = createHash("sha256").update(`${scope}\0${key}`).digest("hex");
  return `${scope.slice(0, 32)}:${digest}`.slice(0, 128);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "P2002"
  );
}

export async function assertRateLimit(
  prisma: RateLimitStore,
  input: { scope: string; key: string; limit: number; windowMs: number; now?: Date }
): Promise<void> {
  const now = input.now ?? new Date();
  const windowStart = new Date(Math.floor(now.getTime() / input.windowMs) * input.windowMs);
  const id = rateLimitBucketId(input.scope, input.key);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const bumped = await prisma.rateLimitBucket.updateMany({
      where: { id, windowStart, count: { lt: input.limit } },
      data: { count: { increment: 1 } }
    });
    if (bumped.count === 1) return;

    const existing = await prisma.rateLimitBucket.findUnique({ where: { id } });
    if (existing && existing.windowStart.getTime() === windowStart.getTime()) {
      throw Errors.rateLimited("Too many requests, please retry later");
    }

    if (!existing) {
      try {
        await prisma.rateLimitBucket.create({
          data: { id, windowStart, count: 1 }
        });
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        continue;
      }
    }

    const reset = await prisma.rateLimitBucket.updateMany({
      where: { id, windowStart: { lt: windowStart } },
      data: { windowStart, count: 1 }
    });
    if (reset.count === 1) return;
  }

  throw Errors.rateLimited("Too many requests, please retry later");
}

export async function pruneRateLimitBuckets(
  prisma: RateLimitStore,
  now = new Date()
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const deleted = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } }
  });
  return deleted.count;
}

export async function assertNamedRateLimit(
  prisma: RateLimitStore,
  name: keyof typeof RATE_LIMITS,
  key: string,
  now?: Date
): Promise<void> {
  const policy = RATE_LIMITS[name];
  await assertRateLimit(prisma, {
    scope: name,
    key,
    limit: policy.limit,
    windowMs: policy.windowMs,
    ...(now ? { now } : {})
  });
}

