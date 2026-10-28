import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoCookieValue, isValidDemoCookie, DEMO_USER_ID } from "@/lib/db";
import { isDemoAuthAllowed, resetEnvCacheForTests } from "@/lib/env";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

beforeEach(() => {
  setEnv({
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    NEXT_PUBLIC_DEMO_MODE: undefined,
    DEMO_SESSION_SECRET: "test-secret",
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCacheForTests();
});

describe("demo cookie signing", () => {
  it("produces a stable HMAC value for the demo user", () => {
    const a = demoCookieValue();
    const b = demoCookieValue();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(DEMO_USER_ID).toBeTruthy();
  });

  it("accepts only the exact signed value (cannot be forged client-side)", () => {
    expect(isValidDemoCookie(demoCookieValue())).toBe(true);
    expect(isValidDemoCookie("deadbeef")).toBe(false);
    expect(isValidDemoCookie("")).toBe(false);
    expect(isValidDemoCookie(undefined)).toBe(false);
    // A value signed with one secret must not validate under another secret.
    const valueSignedWithOriginalSecret = demoCookieValue();
    setEnv({ DEMO_SESSION_SECRET: "another-secret" });
    expect(isValidDemoCookie(valueSignedWithOriginalSecret)).toBe(false);
    expect(isValidDemoCookie(demoCookieValue())).toBe(true);
  });
});

describe("isDemoAuthAllowed", () => {
  it("allows demo access when Supabase is not configured", () => {
    expect(isDemoAuthAllowed()).toBe(true);
  });

  it("forbids demo access when Supabase is configured", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    expect(isDemoAuthAllowed()).toBe(false);
  });

  it("allows demo access when Supabase is configured but demo mode is forced", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      NEXT_PUBLIC_DEMO_MODE: "1",
    });
    expect(isDemoAuthAllowed()).toBe(true);
  });
});
