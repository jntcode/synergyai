import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/demo/login/route";
import { DEMO_COOKIE } from "@/lib/db";
import { resetEnvCacheForTests } from "@/lib/env";
import { resetRateLimits } from "@/lib/rate-limit";

const ORIGINAL_ENV = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
  })),
}));

function demoRequest(ip = "10.0.0.1"): NextRequest {
  return new NextRequest("http://localhost/api/demo/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  setEnv({
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    NEXT_PUBLIC_DEMO_MODE: undefined,
    DEMO_SESSION_SECRET: "test-secret",
  });
  resetRateLimits();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetEnvCacheForTests();
});

describe("POST /api/demo/login", () => {
  it("issues a signed demo cookie when Supabase is not configured", async () => {
    const res = await POST(demoRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; mode: string };
    expect(json.ok).toBe(true);
    expect(json.mode).toBe("demo");
    const cookie = res.cookies.get(DEMO_COOKIE);
    expect(cookie?.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never issues demo credentials when real Supabase auth is configured", async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    const res = await POST(demoRequest("10.0.0.2"));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("demo_disabled");
    expect(res.cookies.get(DEMO_COOKIE)).toBeUndefined();
  });

  it("rate-limits repeated demo login attempts", async () => {
    const ip = "10.0.0.99";
    let last: Response | null = null;
    for (let i = 0; i < 12; i++) {
      last = await POST(demoRequest(ip));
    }
    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
  });
});
