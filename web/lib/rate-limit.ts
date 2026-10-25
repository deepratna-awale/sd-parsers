import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix time in milliseconds when the limit resets */
  reset: number;
  /** Which limit was hit, if any */
  scope?: "minute" | "day" | "global";
}

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

interface Limiter {
  limit(identifier: string): Promise<Omit<LimitResult, "scope">>;
}

const intFromEnv = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const LIMITS = {
  perMinute: intFromEnv("RATE_LIMIT_PER_MINUTE", 10),
  perDay: intFromEnv("RATE_LIMIT_PER_DAY", 200),
  globalPerDay: intFromEnv("RATE_LIMIT_GLOBAL_PER_DAY", 5000),
};

const WINDOW_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Fixed window counter kept in memory: only for local development or as an explicit opt-in */
class MemoryLimiter implements Limiter {
  private readonly hits = new Map<string, { count: number; reset: number }>();
  private readonly windowMs: number;

  constructor(
    private readonly max: number,
    window: Window,
  ) {
    const [amount, unit] = window.split(" ");
    this.windowMs = Number(amount) * WINDOW_MS[unit];
  }

  async limit(identifier: string) {
    const now = Date.now();
    let entry = this.hits.get(identifier);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + this.windowMs };
      this.hits.set(identifier, entry);
    }
    entry.count++;
    if (this.hits.size > 10_000) {
      for (const [key, value] of this.hits) if (value.reset <= now) this.hits.delete(key);
    }
    return {
      success: entry.count <= this.max,
      limit: this.max,
      remaining: Math.max(0, this.max - entry.count),
      reset: entry.reset,
    };
  }
}

function redisFromEnv(): Redis | null {
  // Upstash directly, or the variables the Vercel Marketplace integration sets
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

/** Upstash lets requests through when Redis times out; deny them instead */
function failClosed(ratelimit: Ratelimit): Limiter {
  return {
    async limit(identifier) {
      const result = await ratelimit.limit(identifier);
      return result.reason === "timeout" ? { ...result, success: false } : result;
    },
  };
}

function createLimiters() {
  const redis = redisFromEnv();
  const allowMemory =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_IN_MEMORY_RATE_LIMIT === "true";
  if (!redis && !allowMemory) return null;

  const make = (name: string, max: number, window: Window): Limiter =>
    redis
      ? failClosed(new Ratelimit({
          redis,
          prefix: `sd-parsers:${name}`,
          limiter: name === "minute" ? Ratelimit.slidingWindow(max, window) : Ratelimit.fixedWindow(max, window),
          // remembers blocked clients in memory, so floods do not cost Redis calls
          ephemeralCache: new Map(),
          timeout: 2_000,
          analytics: false,
        }))
      : new MemoryLimiter(max, window);

  return {
    minute: make("minute", LIMITS.perMinute, "1 m"),
    day: make("day", LIMITS.perDay, "1 d"),
    global: make("global", LIMITS.globalPerDay, "1 d"),
  };
}

let limiters: ReturnType<typeof createLimiters> | undefined;

/**
 * Check the per-client and global limits.
 *
 * Returns null when no shared store is configured in production: without one,
 * every serverless instance would keep its own counters, so the API stays closed.
 */
export async function checkRateLimit(key: string): Promise<LimitResult | null> {
  limiters ??= createLimiters();
  if (!limiters) return null;

  const minute = await limiters.minute.limit(key);
  if (!minute.success) return { ...minute, scope: "minute" };

  const day = await limiters.day.limit(key);
  if (!day.success) return { ...day, scope: "day" };

  const global = await limiters.global.limit("all");
  if (!global.success) return { ...global, scope: "global" };

  return minute;
}
