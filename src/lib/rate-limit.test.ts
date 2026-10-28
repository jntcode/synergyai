import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, RATE_LIMITS, resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows up to max requests inside the window", () => {
    const now = 1_000_000;
    const rule = { windowSeconds: 60, max: 3 };
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit("k1", rule, now + i);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
  });

  it("blocks the request after max is exhausted", () => {
    const now = 1_000_000;
    const rule = { windowSeconds: 60, max: 2 };
    checkRateLimit("k2", rule, now);
    checkRateLimit("k2", rule, now + 1);
    const blocked = checkRateLimit("k2", rule, now + 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("slides the window as old entries expire", () => {
    const now = 1_000_000;
    const rule = { windowSeconds: 10, max: 2 };
    checkRateLimit("k3", rule, now);
    checkRateLimit("k3", rule, now + 1000);
    expect(checkRateLimit("k3", rule, now + 2000).ok).toBe(false);
    // 11s later the first two entries are outside the 10s window.
    expect(checkRateLimit("k3", rule, now + 11_000).ok).toBe(true);
  });

  it("keeps buckets isolated per key", () => {
    const now = 1_000_000;
    const rule = { windowSeconds: 60, max: 1 };
    expect(checkRateLimit("a", rule, now).ok).toBe(true);
    expect(checkRateLimit("a", rule, now + 1).ok).toBe(false);
    expect(checkRateLimit("b", rule, now + 1).ok).toBe(true);
  });

  it("exported presets are sane", () => {
    expect(RATE_LIMITS.aiHeavy.max).toBeGreaterThan(0);
    expect(RATE_LIMITS.aiTurn.max).toBeGreaterThanOrEqual(RATE_LIMITS.aiHeavy.max);
    expect(RATE_LIMITS.interviewCreate.windowSeconds).toBeGreaterThanOrEqual(
      RATE_LIMITS.aiHeavy.windowSeconds,
    );
  });
});
