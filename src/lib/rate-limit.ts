/**
 * In-memory sliding-window rate limiter.
 *
 * Limitation (documented): this is per server instance. On multi-instance or
 * serverless deployments with many cold starts, pair this with a shared store
 * (e.g. Upstash Redis) before enforcing billing-critical limits.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export interface RateLimitRule {
  /** Window size in seconds. */
  windowSeconds: number;
  /** Max requests allowed inside the window. */
  max: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitResult {
  const windowMs = rule.windowSeconds * 1000;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= rule.max) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSeconds };
  }
  bucket.timestamps.push(now);
  return { ok: true, remaining: rule.max - bucket.timestamps.length, retryAfterSeconds: 0 };
}

/** Exploit mitigation for unbounded map growth in long-lived processes. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const RATE_LIMITS = {
  /** Expensive AI operations (plan generation, report generation). */
  aiHeavy: { windowSeconds: 60, max: 6 } satisfies RateLimitRule,
  /** Per-turn AI decisions during a live interview. */
  aiTurn: { windowSeconds: 60, max: 30 } satisfies RateLimitRule,
  /** Interview creation. */
  interviewCreate: { windowSeconds: 300, max: 10 } satisfies RateLimitRule,
  /**
   * Interview start. Each attempt may mint paid provider resources
   * (HeyGen secret + LLM config + session token), so keep this tight.
   */
  interviewStart: { windowSeconds: 60, max: 6 } satisfies RateLimitRule,
  /** Auth-ish endpoints (demo login). */
  demoLogin: { windowSeconds: 60, max: 10 } satisfies RateLimitRule,
} as const;
